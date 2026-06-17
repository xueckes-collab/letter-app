import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cheerio from "cheerio";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_TEXT_LENGTH = 12_000;
const DEFAULT_MIN_TEXT_LENGTH = 40;
const DEFAULT_CRAWL_DELAY_MS = 250;
const HARD_MAX_PAGES = 12;

export type ScraplingExtractionMethod = "get" | "fetch" | "stealthy-fetch" | "http-fetch";
type ScraplingCliMethod = Exclude<ScraplingExtractionMethod, "http-fetch">;
export type WebsiteResearchPageType =
  | "homepage"
  | "about"
  | "products"
  | "catalog"
  | "oem"
  | "projects"
  | "certifications"
  | "news"
  | "contact"
  | "other";

export type WebsiteResearchErrorCode =
  | "INVALID_URL"
  | "SCRAPLING_UNAVAILABLE"
  | "EXTRACTION_FAILED"
  | "TIMEOUT"
  | "EMPTY_CONTENT"
  | "DISCOVERY_FAILED";

export interface ScraplingAttemptSummary {
  method: ScraplingExtractionMethod;
  exitCode: number | null;
  timedOut: boolean;
  message: string;
  stderr?: string;
  stdout?: string;
}

export interface WebsiteResearchError {
  code: WebsiteResearchErrorCode;
  message: string;
  details?: string;
  attempts?: ScraplingAttemptSummary[];
}

export interface WebsiteResearchSource {
  url: string;
  pageType: WebsiteResearchPageType;
  title: string;
  text: string;
  extractionMethod: ScraplingExtractionMethod | "none";
  confidence: number;
  error?: WebsiteResearchError;
}

export interface CrawlWebsiteDeepOptions {
  maxPages?: number;
  timeoutMs?: number;
  minTextLength?: number;
  maxTextLength?: number;
  crawlDelayMs?: number;
  scraplingBin?: string;
  env?: NodeJS.ProcessEnv;
  proxy?: string;
  headers?: Record<string, string>;
  cookies?: string;
  waitMs?: number;
  networkIdle?: boolean;
  disableResources?: boolean;
  solveCloudflare?: boolean;
  includeSubpageDiscovery?: boolean;
}

export interface DiscoveredWebsitePage {
  url: string;
  pageType: WebsiteResearchPageType;
  score: number;
  anchorText?: string;
}

interface ScraplingCliExecution {
  method: ScraplingCliMethod;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  content: string;
  error?: WebsiteResearchError;
}

interface ScraplingExtractionSuccess {
  ok: true;
  url: string;
  method: ScraplingExtractionMethod;
  content: string;
  attempts: ScraplingAttemptSummary[];
}

interface ScraplingExtractionFailure {
  ok: false;
  url: string;
  method: ScraplingExtractionMethod | "none";
  attempts: ScraplingAttemptSummary[];
  error: WebsiteResearchError;
}

type ScraplingExtraction = ScraplingExtractionSuccess | ScraplingExtractionFailure;

const CORE_PAGE_ORDER: WebsiteResearchPageType[] = [
  "homepage",
  "about",
  "products",
  "catalog",
  "oem",
  "projects",
  "certifications",
  "news",
  "contact",
];

const PAGE_TYPE_SPECS: Array<{
  pageType: Exclude<WebsiteResearchPageType, "homepage" | "other">;
  baseScore: number;
  patterns: RegExp[];
}> = [
  {
    pageType: "about",
    baseScore: 90,
    patterns: [/about/i, /who[-_\s]?we[-_\s]?are/i, /company/i, /profile/i, /our[-_\s]?story/i],
  },
  {
    pageType: "products",
    baseScore: 86,
    patterns: [/products?/i, /product[-_\s]?category/i, /collections?/i, /solutions?/i, /flooring/i],
  },
  {
    pageType: "catalog",
    baseScore: 84,
    patterns: [/catalog(?:ue)?/i, /brochures?/i, /downloads?/i, /product[-_\s]?list/i],
  },
  {
    pageType: "oem",
    baseScore: 82,
    patterns: [/oem/i, /odm/i, /private[-_\s]?label/i, /custom/i, /manufactur/i, /factory/i],
  },
  {
    pageType: "projects",
    baseScore: 80,
    patterns: [/projects?/i, /case[-_\s]?stud(?:y|ies)/i, /portfolio/i, /gallery/i, /references?/i],
  },
  {
    pageType: "certifications",
    baseScore: 78,
    patterns: [/certif/i, /sustainab/i, /quality/i, /compliance/i, /standards?/i, /environment/i, /green/i, /\biso\b/i, /\bfsc\b/i],
  },
  {
    pageType: "news",
    baseScore: 74,
    patterns: [/news/i, /blog/i, /articles?/i, /insights?/i, /media/i, /press/i],
  },
  {
    pageType: "contact",
    baseScore: 88,
    patterns: [/contact/i, /get[-_\s]?in[-_\s]?touch/i, /reach[-_\s]?us/i, /inquir(?:y|e)/i, /quote/i],
  },
];

const SKIP_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".css",
  ".js",
  ".mjs",
  ".pdf",
  ".zip",
  ".rar",
  ".7z",
  ".mp4",
  ".mov",
  ".mp3",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
]);

export function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^(mailto|tel|javascript):/i.test(trimmed)) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function buildHomepageCandidates(websiteUrl: string): string[] {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return [];

  const candidates = new Set<string>([normalized]);
  const url = new URL(normalized);

  if (!url.hostname.startsWith("www.")) {
    const wwwUrl = new URL(url.toString());
    wwwUrl.hostname = `www.${url.hostname}`;
    candidates.add(wwwUrl.toString());
  }

  if (url.protocol === "https:") {
    const httpUrl = new URL(url.toString());
    httpUrl.protocol = "http:";
    candidates.add(httpUrl.toString());
  }

  return Array.from(candidates);
}

export function buildScraplingArgs(
  method: ScraplingCliMethod,
  url: string,
  outputPath: string,
  options: CrawlWebsiteDeepOptions = {},
): string[] {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const args = ["extract", method, url, outputPath, "--ai-targeted"];

  args.push("--timeout", method === "get" ? String(Math.ceil(timeoutMs / 1000)) : String(timeoutMs));

  if (options.proxy) args.push("--proxy", options.proxy);

  for (const [header, value] of Object.entries(options.headers ?? {})) {
    args.push("-H", `${header}: ${value}`);
  }

  if (method === "get" && options.cookies) {
    args.push("--cookies", options.cookies);
  }

  if (method !== "get") {
    if (options.waitMs && options.waitMs > 0) args.push("--wait", String(options.waitMs));
    if (options.networkIdle) args.push("--network-idle");
    if (options.disableResources) args.push("--disable-resources");
  }

  if (method === "stealthy-fetch" && options.solveCloudflare) {
    args.push("--solve-cloudflare");
  }

  return args;
}

export function inferPageType(url: string, anchorText = ""): { pageType: WebsiteResearchPageType; score: number } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { pageType: "other", score: 0 };
  }

  if (isHomepageUrl(parsed)) {
    return { pageType: "homepage", score: 100 };
  }

  const decodedPath = safeDecode(parsed.pathname).replace(/[-_/]+/g, " ");
  const haystack = `${decodedPath} ${safeDecode(anchorText)}`.toLowerCase();
  let best: { pageType: WebsiteResearchPageType; score: number } = { pageType: "other", score: 0 };

  for (const spec of PAGE_TYPE_SPECS) {
    const matches = spec.patterns.reduce((count, pattern) => count + (pattern.test(haystack) ? 1 : 0), 0);
    if (matches === 0) continue;

    const pathDepthPenalty = Math.max(0, parsed.pathname.split("/").filter(Boolean).length - 1) * 4;
    const score = spec.baseScore + matches * 8 - pathDepthPenalty;

    if (score > best.score) {
      best = { pageType: spec.pageType, score };
    }
  }

  return best;
}

export function discoverCorePages(content: string, homepageUrl: string, maxPages = HARD_MAX_PAGES): DiscoveredWebsitePage[] {
  const normalizedHomepage = normalizeWebsiteUrl(homepageUrl);
  if (!normalizedHomepage) return [];

  const limit = clampPageLimit(maxPages);
  const homepage: DiscoveredWebsitePage = { url: normalizedHomepage, pageType: "homepage", score: 100 };
  const candidates = new Map<string, DiscoveredWebsitePage>([[canonicalizeUrl(normalizedHomepage), homepage]]);

  for (const link of extractLinks(content, normalizedHomepage)) {
    const normalizedUrl = normalizeAndFilterLink(link.href, normalizedHomepage);
    if (!normalizedUrl) continue;

    const inferred = inferPageType(normalizedUrl, link.text);
    if (inferred.pageType === "homepage" || inferred.pageType === "other" || inferred.score < 55) continue;

    const canonical = canonicalizeUrl(normalizedUrl);
    const candidate: DiscoveredWebsitePage = {
      url: normalizedUrl,
      pageType: inferred.pageType,
      score: inferred.score,
      anchorText: normalizeWhitespace(link.text).slice(0, 160) || undefined,
    };
    const existing = candidates.get(canonical);
    if (!existing || candidate.score > existing.score) {
      candidates.set(canonical, candidate);
    }
  }

  const byType = new Map<WebsiteResearchPageType, DiscoveredWebsitePage>();
  const extras: DiscoveredWebsitePage[] = [];

  for (const candidate of Array.from(candidates.values())) {
    if (candidate.pageType === "homepage") continue;
    const existing = byType.get(candidate.pageType);
    if (!existing || candidate.score > existing.score) byType.set(candidate.pageType, candidate);
    extras.push(candidate);
  }

  const ordered: DiscoveredWebsitePage[] = [homepage];
  for (const pageType of CORE_PAGE_ORDER) {
    if (pageType === "homepage") continue;
    const candidate = byType.get(pageType);
    if (candidate) ordered.push(candidate);
  }

  const seen = new Set(ordered.map((page) => canonicalizeUrl(page.url)));
  for (const candidate of extras.sort((a, b) => b.score - a.score)) {
    const canonical = canonicalizeUrl(candidate.url);
    if (seen.has(canonical)) continue;
    ordered.push(candidate);
    seen.add(canonical);
    if (ordered.length >= limit) break;
  }

  return ordered.slice(0, limit);
}

export function cleanExtractedText(content: string, maxLength = DEFAULT_MAX_TEXT_LENGTH): string {
  const text = looksLikeHtml(content) ? extractTextFromHtml(content) : stripMarkdownNoise(content);
  return normalizeWhitespace(text).slice(0, maxLength);
}

export async function crawlWebsiteDeep(
  websiteUrl: string,
  options: CrawlWebsiteDeepOptions = {},
): Promise<WebsiteResearchSource[]> {
  try {
    const maxPages = clampPageLimit(options.maxPages ?? HARD_MAX_PAGES);
    const homepageCandidates = buildHomepageCandidates(websiteUrl);

    if (homepageCandidates.length === 0) {
      return [
        errorSource(websiteUrl, "homepage", {
          code: "INVALID_URL",
          message: "Website URL is invalid.",
        }),
      ];
    }

    const homepageExtraction = await extractFirstReachableHomepage(homepageCandidates, options);
    if (!homepageExtraction.ok) {
      return [
        errorSource(homepageCandidates[0], "homepage", {
          ...homepageExtraction.error,
          attempts: homepageExtraction.attempts,
        }),
      ];
    }

    const discoveredPages = discoverCorePages(homepageExtraction.content, homepageExtraction.url, maxPages);
    const queue: DiscoveredWebsitePage[] =
      discoveredPages.length > 0 ? discoveredPages : [{ url: homepageExtraction.url, pageType: "homepage", score: 100 }];
    const results: WebsiteResearchSource[] = [];
    const visited = new Set<string>();

    results.push(toResearchSource(homepageExtraction.url, "homepage", homepageExtraction, options));
    visited.add(canonicalizeUrl(homepageExtraction.url));

    for (let index = 1; index < queue.length && results.length < maxPages; index += 1) {
      const page = queue[index];
      const canonical = canonicalizeUrl(page.url);
      if (visited.has(canonical)) continue;
      visited.add(canonical);

      await sleep(options.crawlDelayMs ?? DEFAULT_CRAWL_DELAY_MS);

      const extraction = await extractWithFallback(page.url, "md", options);
      if (extraction.ok) {
        results.push(toResearchSource(page.url, page.pageType, extraction, options));

        if (options.includeSubpageDiscovery !== false && results.length < maxPages) {
          for (const discovered of discoverCorePages(extraction.content, homepageExtraction.url, maxPages)) {
            const discoveredCanonical = canonicalizeUrl(discovered.url);
            if (visited.has(discoveredCanonical) || queue.some((queued) => canonicalizeUrl(queued.url) === discoveredCanonical)) continue;
            queue.push(discovered);
            if (queue.length >= maxPages) break;
          }
        }
      } else {
        results.push(errorSource(page.url, page.pageType, extraction.error, extraction.method));
      }
    }

    return results.slice(0, maxPages);
  } catch (error) {
    return [
      errorSource(websiteUrl, "homepage", {
        code: "EXTRACTION_FAILED",
        message: "Unexpected crawler failure.",
        details: error instanceof Error ? error.message : String(error),
      }),
    ];
  }
}

async function extractFirstReachableHomepage(
  homepageCandidates: string[],
  options: CrawlWebsiteDeepOptions,
): Promise<ScraplingExtraction> {
  const attempts: ScraplingAttemptSummary[] = [];
  let lastError: WebsiteResearchError | undefined;

  for (const candidate of homepageCandidates) {
    const extraction = await extractWithFallback(candidate, "html", options);
    attempts.push(...extraction.attempts);
    if (extraction.ok) return extraction;

    lastError = extraction.error;
    if (extraction.error.code === "SCRAPLING_UNAVAILABLE") break;
  }

  return {
    ok: false,
    url: homepageCandidates[0],
    method: "none",
    attempts,
    error: lastError ?? {
      code: "EXTRACTION_FAILED",
      message: "Unable to extract homepage.",
      attempts,
    },
  };
}

async function extractWithFallback(
  url: string,
  format: "html" | "md",
  options: CrawlWebsiteDeepOptions,
): Promise<ScraplingExtraction> {
  const attempts: ScraplingAttemptSummary[] = [];
  const methods: ScraplingCliMethod[] = ["get", "fetch", "stealthy-fetch"];
  let lastMethod: ScraplingExtractionMethod | "none" = "none";
  let lastError: WebsiteResearchError | undefined;

  for (const method of methods) {
    lastMethod = method;
    const execution = await runScraplingCli(method, url, format, options);
    attempts.push(toAttemptSummary(execution));

    if (execution.error?.code === "SCRAPLING_UNAVAILABLE") {
      const fallback = await runBuiltInHttpFetch(url, format, options);
      attempts.push(fallback.attempt);
      if (fallback.ok) {
        return {
          ok: true,
          url,
          method: "http-fetch",
          content: fallback.content,
          attempts,
        };
      }

      return {
        ok: false,
        url,
        method: "http-fetch",
        attempts,
        error: { ...fallback.error, attempts },
      };
    }

    if (execution.error) {
      lastError = execution.error;
      continue;
    }

    const cleaned = cleanExtractedText(execution.content, options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH);
    if (cleaned.length >= (options.minTextLength ?? DEFAULT_MIN_TEXT_LENGTH) || extractLinks(execution.content, url).length > 0) {
      return {
        ok: true,
        url,
        method,
        content: execution.content,
        attempts,
      };
    }

    lastError = {
      code: "EMPTY_CONTENT",
      message: "Scrapling returned empty or too-short content.",
      details: `Extracted ${cleaned.length} characters from ${url}.`,
    };
  }

  return {
    ok: false,
    url,
    method: lastMethod,
    attempts,
    error: {
      code: lastError?.code ?? "EXTRACTION_FAILED",
      message: lastError?.message ?? "All Scrapling extraction methods failed.",
      details: lastError?.details,
      attempts,
    },
  };
}

async function runScraplingCli(
  method: ScraplingCliMethod,
  url: string,
  format: "html" | "md",
  options: CrawlWebsiteDeepOptions,
): Promise<ScraplingCliExecution> {
  const scraplingBin = options.scraplingBin ?? process.env.SCRAPLING_BIN ?? "scrapling";
  const tempDir = await mkdtemp(join(tmpdir(), "letter-scrapling-"));
  const outputPath = join(tempDir, `page-${randomUUID()}.${format}`);
  const args = buildScraplingArgs(method, url, outputPath, options);

  try {
    const result = await executeCommand(scraplingBin, args, options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.env);
    if (result.error) {
      return {
        method,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: result.stdout,
        stderr: result.stderr,
        content: "",
        error: result.error,
      };
    }

    const content = await readFile(outputPath, "utf8").catch(() => "");
    if (!content.trim()) {
      return {
        method,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: result.stdout,
        stderr: result.stderr,
        content,
        error: {
          code: "EMPTY_CONTENT",
          message: "Scrapling created no readable output.",
          details: trimDiagnostic(result.stderr || result.stdout),
        },
      };
    }

    return {
      method,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      stdout: result.stdout,
      stderr: result.stderr,
      content,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function runBuiltInHttpFetch(
  url: string,
  format: "html" | "md",
  options: CrawlWebsiteDeepOptions,
): Promise<
  | { ok: true; content: string; attempt: ScraplingAttemptSummary }
  | { ok: false; error: WebsiteResearchError; attempt: ScraplingAttemptSummary }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; LetterAppResearchBot/1.0; +https://letter-app-1fmm.onrender.com)",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        ...(options.headers ?? {}),
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const content = format === "md" && contentType.includes("html") ? htmlToSimpleMarkdown(body, url) : body;

    if (!response.ok) {
      const error: WebsiteResearchError = {
        code: "EXTRACTION_FAILED",
        message: `Built-in HTTP fetch returned ${response.status}.`,
        details: response.statusText,
      };
      return {
        ok: false,
        error,
        attempt: {
          method: "http-fetch",
          exitCode: response.status,
          timedOut: false,
          message: error.message,
        },
      };
    }

    return {
      ok: true,
      content,
      attempt: {
        method: "http-fetch",
        exitCode: 0,
        timedOut: false,
        message: "Built-in HTTP fetch completed.",
      },
    };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const fetchError: WebsiteResearchError = {
      code: timedOut ? "TIMEOUT" : "EXTRACTION_FAILED",
      message: timedOut ? "Built-in HTTP fetch timed out." : "Built-in HTTP fetch failed.",
      details: error instanceof Error ? error.message : String(error),
    };
    return {
      ok: false,
      error: fetchError,
      attempt: {
        method: "http-fetch",
        exitCode: null,
        timedOut,
        message: fetchError.message,
        stderr: fetchError.details,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function executeCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  env?: NodeJS.ProcessEnv,
): Promise<{
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  error?: WebsiteResearchError;
}> {
  return new Promise((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";

    let child: ReturnType<typeof spawn>;

    try {
      child = spawn(command, args, {
        env: { ...process.env, ...env },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      resolve({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr,
        error: {
          code: "EXTRACTION_FAILED",
          message: "Failed to start Scrapling.",
          details: message,
        },
      });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
      if (typeof killTimer !== "number") killTimer.unref();
    }, timeoutMs + 1_000);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: null,
        timedOut: false,
        stdout,
        stderr,
        error: {
          code: error.code === "ENOENT" ? "SCRAPLING_UNAVAILABLE" : "EXTRACTION_FAILED",
          message: error.code === "ENOENT" ? "Scrapling binary is not available." : "Failed to start Scrapling.",
          details: error.message,
        },
      });
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          exitCode,
          timedOut: true,
          stdout,
          stderr,
          error: {
            code: "TIMEOUT",
            message: "Scrapling extraction timed out.",
            details: trimDiagnostic(stderr || stdout),
          },
        });
        return;
      }

      if (exitCode !== 0) {
        resolve({
          exitCode,
          timedOut: false,
          stdout,
          stderr,
          error: {
            code: "EXTRACTION_FAILED",
            message: `Scrapling exited with code ${exitCode}.`,
            details: trimDiagnostic(stderr || stdout),
          },
        });
        return;
      }

      resolve({ exitCode, timedOut: false, stdout, stderr });
    });
  });
}

function toResearchSource(
  url: string,
  pageType: WebsiteResearchPageType,
  extraction: ScraplingExtractionSuccess,
  options: CrawlWebsiteDeepOptions,
): WebsiteResearchSource {
  const maxTextLength = options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH;
  const text = cleanExtractedText(extraction.content, maxTextLength);
  const title = extractTitle(extraction.content, url);

  return {
    url,
    pageType,
    title,
    text,
    extractionMethod: extraction.method,
    confidence: calculateConfidence(extraction.method, pageType, title, text),
  };
}

function errorSource(
  url: string,
  pageType: WebsiteResearchPageType,
  error: WebsiteResearchError,
  method: ScraplingExtractionMethod | "none" = "none",
): WebsiteResearchSource {
  return {
    url,
    pageType,
    title: "",
    text: "",
    extractionMethod: method,
    confidence: 0,
    error,
  };
}

function toAttemptSummary(execution: ScraplingCliExecution): ScraplingAttemptSummary {
  return {
    method: execution.method,
    exitCode: execution.exitCode,
    timedOut: execution.timedOut,
    message: execution.error?.message ?? "Scrapling extraction completed.",
    stderr: trimDiagnostic(execution.stderr) || undefined,
    stdout: trimDiagnostic(execution.stdout) || undefined,
  };
}

function extractLinks(content: string, baseUrl: string): Array<{ href: string; text: string }> {
  if (!content.trim()) return [];
  if (looksLikeHtml(content)) return extractHtmlLinks(content);
  return extractMarkdownLinks(content, baseUrl);
}

function extractHtmlLinks(html: string): Array<{ href: string; text: string }> {
  const $ = cheerio.load(html);
  const links: Array<{ href: string; text: string }> = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    links.push({ href, text: $(element).text() });
  });

  return links;
}

function extractMarkdownLinks(markdown: string, baseUrl: string): Array<{ href: string; text: string }> {
  const links: Array<{ href: string; text: string }> = [];
  const markdownLinkPattern = /\[([^\]]{1,180})\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const urlPattern = /https?:\/\/[^\s)<>"']+/g;

  for (const match of Array.from(markdown.matchAll(markdownLinkPattern))) {
    links.push({ text: match[1], href: match[2] });
  }

  for (const match of Array.from(markdown.matchAll(urlPattern))) {
    links.push({ text: "", href: match[0] });
  }

  if (links.length === 0 && baseUrl) {
    const relativePattern = /href=["']([^"']+)["']/gi;
    for (const match of Array.from(markdown.matchAll(relativePattern))) {
      links.push({ text: "", href: match[1] });
    }
  }

  return links;
}

function normalizeAndFilterLink(href: string, baseUrl: string): string | null {
  if (!href || /^(mailto|tel|javascript):/i.test(href)) return null;

  try {
    const base = new URL(baseUrl);
    const url = new URL(href, baseUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (normalizeHost(url.hostname) !== normalizeHost(base.hostname)) return null;
    if (hasSkippedExtension(url.pathname)) return null;
    if (url.pathname.split("/").filter(Boolean).length > 4) return null;
    url.hash = "";
    url.search = "";
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    const pathname = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${normalizeHost(parsed.hostname)}${pathname}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function hasSkippedExtension(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  for (const extension of Array.from(SKIP_EXTENSIONS)) {
    if (lower.endsWith(extension)) return true;
  }
  return false;
}

function extractTitle(content: string, url: string): string {
  if (looksLikeHtml(content)) {
    const $ = cheerio.load(content);
    const title =
      normalizeWhitespace($("title").first().text()) ||
      normalizeWhitespace($("meta[property='og:title']").attr("content") ?? "") ||
      normalizeWhitespace($("h1").first().text());
    if (title) return title.slice(0, 180);
  }

  const heading = content.match(/^#\s+(.+)$/m);
  if (heading?.[1]) return normalizeWhitespace(heading[1]).slice(0, 180);

  return titleFromUrl(url);
}

function extractTextFromHtml(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg, nav, footer, header, form").remove();
  return $("body").text() || $.root().text();
}

function htmlToSimpleMarkdown(html: string, baseUrl: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg").remove();

  const lines: string[] = [];
  $("h1, h2, h3, p, li, a[href]").each((_, element) => {
    const tag = element.tagName?.toLowerCase();
    const text = normalizeWhitespace($(element).text());
    if (!text) return;

    if (tag === "a") {
      const href = $(element).attr("href");
      if (!href) return;
      try {
        const absolute = new URL(href, baseUrl).toString();
        lines.push(`[${text}](${absolute})`);
      } catch {
        lines.push(text);
      }
      return;
    }

    if (tag === "h1") lines.push(`# ${text}`);
    else if (tag === "h2") lines.push(`## ${text}`);
    else if (tag === "h3") lines.push(`### ${text}`);
    else lines.push(text);
  });

  return lines.join("\n");
}

function stripMarkdownNoise(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_>#|-]+/g, " ");
}

function looksLikeHtml(content: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(content);
}

function calculateConfidence(
  method: ScraplingExtractionMethod,
  pageType: WebsiteResearchPageType,
  title: string,
  text: string,
): number {
  const methodBase: Record<ScraplingExtractionMethod, number> = {
    get: 0.72,
    fetch: 0.82,
    "stealthy-fetch": 0.88,
    "http-fetch": 0.68,
  };
  const lengthBonus = Math.min(0.08, text.length / 30_000);
  const titleBonus = title ? 0.03 : 0;
  const pageTypeBonus = pageType === "other" ? 0 : 0.04;
  return roundConfidence(Math.min(0.98, methodBase[method] + lengthBonus + titleBonus + pageTypeBonus));
}

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split("/").filter(Boolean).at(-1);
    if (!segment) return normalizeHost(parsed.hostname);
    return safeDecode(segment).replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
  } catch {
    return "";
  }
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isHomepageUrl(url: URL): boolean {
  return url.pathname === "" || url.pathname === "/";
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function trimDiagnostic(value: string, maxLength = 1_000): string {
  return normalizeWhitespace(value).slice(0, maxLength);
}

function clampPageLimit(value: number): number {
  if (!Number.isFinite(value)) return HARD_MAX_PAGES;
  return Math.max(1, Math.min(HARD_MAX_PAGES, Math.floor(value)));
}

function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
