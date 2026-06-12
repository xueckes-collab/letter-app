import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const FETCH_TIMEOUT = 10000;
const FAST_MAX_PAGES = 6;
const DEFAULT_DEEP_MAX_PAGES = 30;
const DEFAULT_DEEP_TIMEOUT_MS = 90000;
const MAX_TEXT_LENGTH = 8000;
const WORKER_STDIO_MAX_CHARS = 10 * 1024 * 1024;

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const KEY_PAGE_PATTERNS = [
  { key: "about", patterns: [/about/i, /who-we-are/i, /company/i, /our-story/i] },
  { key: "products", patterns: [/products/i, /collections/i, /catalog/i, /shop/i, /flooring/i] },
  { key: "contact", patterns: [/contact/i, /get-in-touch/i, /reach-us/i] },
  { key: "projects", patterns: [/projects/i, /case-stud/i, /portfolio/i, /gallery/i, /references/i] },
  { key: "certifications", patterns: [/certif/i, /sustainability/i, /environ/i, /green/i, /compliance/i] },
  { key: "blog", patterns: [/blog/i, /news/i, /articles/i, /insights/i] },
];

export type ScrapeMode = "fast" | "deep" | "auto";
export type ScrapePageType =
  | "homepage"
  | "applications"
  | "about"
  | "products"
  | "contact"
  | "projects"
  | "certifications"
  | "blog"
  | "news"
  | "case_study"
  | "case_studies"
  | "sustainability"
  | "faq"
  | "other";

export type ScrapePage = {
  url: string;
  title?: string;
  text: string;
  headings?: string[];
  pageType: ScrapePageType;
};

export type ScrapeEvidence = {
  type: string;
  sourceUrl: string;
  text: string;
  confidence: number;
};

export type ScrapeStats = {
  pagesFetched: number;
  pagesAttempted: number;
  textChars: number;
  durationMs: number;
  usedWorker: boolean;
};

export type ScrapeOptions = {
  mode?: ScrapeMode;
  maxPages?: number;
  timeoutMs?: number;
  respectRobots?: boolean;
  fallbackToFast?: boolean;
};

type WorkerResult = {
  ok: boolean;
  pages?: ScrapePage[];
  evidence?: ScrapeEvidence[];
  stats?: Partial<ScrapeStats>;
  warnings?: string[];
  error?: string | { code?: string; message?: string; details?: unknown } | null;
};

type Metadata = ReturnType<typeof extractMetadata>;

export interface ScrapeResult {
  url: string;
  homepage: string | null;
  subpages: Record<string, { url: string; text: string; metadata: Metadata }>;
  metadata: Metadata | null;
  error: string | null;
  pages: ScrapePage[];
  evidence: ScrapeEvidence[];
  stats: ScrapeStats;
  modeRequested: ScrapeMode;
  modeUsed: "fast" | "deep";
  warnings: string[];
}

async function fetchPage(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: "follow" });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeWebsiteUrl(websiteUrl: string) {
  let url = websiteUrl.trim();
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

function extractText($: cheerio.CheerioAPI): string {
  $("script, style, noscript, iframe, svg, nav, footer").remove();
  const text = $("body").text().replace(/\s+/g, " ").replace(/\n\s*\n/g, "\n").trim();
  return text.substring(0, MAX_TEXT_LENGTH);
}

function findKeyPages($: cheerio.CheerioAPI, baseUrl: string): Map<string, string> {
  const links = new Map<string, string>();
  const base = new URL(baseUrl);
  $("a[href]").each((_: number, el: any) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.hostname !== base.hostname) return;
      const pathName = url.pathname.toLowerCase();
      const linkText = $(el).text().toLowerCase().trim();
      for (const { key, patterns } of KEY_PAGE_PATTERNS) {
        if (links.has(key)) continue;
        for (const pattern of patterns) {
          if (pattern.test(pathName) || pattern.test(linkText)) {
            links.set(key, url.toString());
            break;
          }
        }
      }
    } catch {
      /* skip */
    }
  });
  return links;
}

function extractMetadata($: cheerio.CheerioAPI, url: string) {
  const title = $("title").text().trim();
  const description = $("meta[name=\"description\"]").attr("content") || "";
  const keywords = $("meta[name=\"keywords\"]").attr("content") || "";
  const ogTitle = $("meta[property=\"og:title\"]").attr("content") || "";
  const ogDescription = $("meta[property=\"og:description\"]").attr("content") || "";
  const lang = $("html").attr("lang") || "";
  const headings: string[] = [];
  $("h1, h2, h3").each((_: number, el: any) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });
  return { title: title || ogTitle, description: description || ogDescription, keywords, language: lang, headings: headings.slice(0, 20) };
}

function pageTypeFromKey(key: string): ScrapePageType {
  if (key === "case_study" || key === "sustainability" || key === "faq") return key;
  if (["about", "products", "contact", "projects", "certifications", "blog"].includes(key)) {
    return key as ScrapePageType;
  }
  return "other";
}

function buildEvidenceFromPage(page: ScrapePage): ScrapeEvidence[] {
  const evidence: ScrapeEvidence[] = [];
  for (const heading of page.headings || []) {
    evidence.push({ type: "heading", sourceUrl: page.url, text: heading, confidence: 0.75 });
  }
  const sentences = page.text
    .split(/(?<=[.!?。！？])\s+/)
    .map(item => item.trim())
    .filter(item => item.length >= 40 && item.length <= 240)
    .slice(0, 5);
  for (const sentence of sentences) {
    evidence.push({ type: page.pageType, sourceUrl: page.url, text: sentence, confidence: 0.6 });
  }
  return evidence;
}

function emptyStats(startedAt: number): ScrapeStats {
  return {
    pagesFetched: 0,
    pagesAttempted: 0,
    textChars: 0,
    durationMs: Date.now() - startedAt,
    usedWorker: false,
  };
}

async function scrapeWebsiteFast(websiteUrl: string, modeRequested: ScrapeMode = "fast"): Promise<ScrapeResult> {
  const startedAt = Date.now();
  let url = normalizeWebsiteUrl(websiteUrl);
  const results: ScrapeResult = {
    url,
    homepage: null,
    subpages: {},
    metadata: null,
    error: null,
    pages: [],
    evidence: [],
    stats: emptyStats(startedAt),
    modeRequested,
    modeUsed: "fast",
    warnings: [],
  };

  let homepageHtml = await fetchPage(url);
  results.stats.pagesAttempted++;
  if (!homepageHtml && url.startsWith("https://") && !url.includes("://www.")) {
    const wwwUrl = url.replace("https://", "https://www.");
    homepageHtml = await fetchPage(wwwUrl);
    results.stats.pagesAttempted++;
    if (homepageHtml) url = wwwUrl;
  }
  if (!homepageHtml) {
    results.error = "Could not access website";
    results.stats.durationMs = Date.now() - startedAt;
    return results;
  }

  const $ = cheerio.load(homepageHtml);
  results.url = url;
  results.metadata = extractMetadata($, url);
  results.homepage = extractText($);
  const homepage: ScrapePage = {
    url,
    title: results.metadata.title,
    text: results.homepage,
    headings: results.metadata.headings,
    pageType: "homepage",
  };
  results.pages.push(homepage);
  results.evidence.push(...buildEvidenceFromPage(homepage));
  results.stats.pagesFetched++;

  const keyPages = findKeyPages($, url);
  let fetchedCount = 0;
  for (const [key, pageUrl] of Array.from(keyPages.entries())) {
    if (fetchedCount >= FAST_MAX_PAGES) break;
    await new Promise(r => setTimeout(r, 500));
    results.stats.pagesAttempted++;
    const html = await fetchPage(pageUrl);
    if (html) {
      const sub$ = cheerio.load(html);
      const metadata = extractMetadata(sub$, pageUrl);
      const text = extractText(sub$);
      results.subpages[key] = { url: pageUrl, text, metadata };
      const page: ScrapePage = {
        url: pageUrl,
        title: metadata.title,
        text,
        headings: metadata.headings,
        pageType: pageTypeFromKey(key),
      };
      results.pages.push(page);
      results.evidence.push(...buildEvidenceFromPage(page));
      results.stats.pagesFetched++;
      fetchedCount++;
    }
  }

  results.stats.textChars = results.pages.reduce((sum, page) => sum + page.text.length, 0);
  results.stats.durationMs = Date.now() - startedAt;
  return results;
}

function isFastResultEnough(result: ScrapeResult) {
  const hasKeySubpage = Object.keys(result.subpages).some(key => ["about", "products", "projects", "certifications"].includes(key));
  return !result.error && result.stats.textChars >= 6000 && result.pages.length >= 3 && hasKeySubpage;
}

function getWorkerCandidates() {
  const candidates: string[] = [];
  if (process.env.SCRAPLING_WORKER_PATH) candidates.push(process.env.SCRAPLING_WORKER_PATH);
  const workerExecutableNames = process.platform === "win32"
    ? ["scrapling-worker.exe", "scrapling_worker.exe", "worker.exe"]
    : ["scrapling-worker", "scrapling_worker", "worker"];
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    for (const fileName of workerExecutableNames) candidates.push(path.join(resourcesPath, "scrapling-worker", fileName));
    candidates.push(path.join(resourcesPath, "scrapling-worker", "worker.py"));
  }
  const cwd = process.cwd();
  for (const fileName of workerExecutableNames) candidates.push(path.join(cwd, "build", "scrapling-worker", fileName));
  candidates.push(path.join(cwd, ".desktop-resources", "scrapling-worker", "worker.py"));
  candidates.push(path.join(cwd, "workers", "scrapling_worker", "worker.py"));
  const here = path.dirname(fileURLToPath(import.meta.url));
  candidates.push(path.resolve(here, "..", "..", "workers", "scrapling_worker", "worker.py"));
  return candidates.filter((candidate, index, list) => candidate && list.indexOf(candidate) === index);
}

function normalizeWorkerPageType(pageType: unknown): ScrapePageType {
  const value = String(pageType || "other").toLowerCase().replace(/-/g, "_");
  if (value === "home") return "homepage";
  if (
    [
      "homepage",
      "applications",
      "about",
      "products",
      "contact",
      "projects",
      "certifications",
      "blog",
      "news",
      "case_study",
      "case_studies",
      "sustainability",
      "faq",
      "other",
    ].includes(value)
  ) {
    return value as ScrapePageType;
  }
  return "other";
}

function workerErrorMessage(error: WorkerResult["error"]) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return [error.code, error.message].filter(Boolean).join(": ");
}

function getPythonCommand() {
  if (process.env.SCRAPLING_PYTHON) return process.env.SCRAPLING_PYTHON;
  if (process.platform === "win32") return "python";
  return "python3";
}

function getWorkerCommand(workerPath: string) {
  const ext = path.extname(workerPath).toLowerCase();
  if (ext === ".py") return { command: getPythonCommand(), args: [workerPath] };
  if ([".js", ".mjs", ".cjs"].includes(ext)) return { command: process.execPath, args: [workerPath] };
  return { command: workerPath, args: [] };
}

function appendLimited(buffer: string, chunk: Buffer) {
  if (buffer.length >= WORKER_STDIO_MAX_CHARS) return buffer;
  return (buffer + chunk.toString("utf8")).slice(0, WORKER_STDIO_MAX_CHARS);
}

function parseWorkerOutput(stdout: string) {
  try {
    return JSON.parse(stdout || "{}") as WorkerResult;
  } catch {
    const jsonLine = stdout
      .split(/\r?\n/)
      .map(line => line.trim())
      .reverse()
      .find(line => line.startsWith("{") && line.endsWith("}"));
    if (!jsonLine) throw new Error("Scrapling worker returned invalid JSON");
    return JSON.parse(jsonLine) as WorkerResult;
  }
}

async function runScraplingWorker(url: string, options: Required<Pick<ScrapeOptions, "maxPages" | "timeoutMs" | "respectRobots">>): Promise<WorkerResult> {
  const workerPath = getWorkerCandidates().find(candidate => fs.existsSync(candidate));
  if (!workerPath) {
    return { ok: false, error: "Scrapling worker not found", warnings: ["Deep scraping worker is not bundled yet."] };
  }

  const { command, args } = getWorkerCommand(workerPath);
  const payload = JSON.stringify({
    url,
    maxPages: options.maxPages,
    timeoutMs: options.timeoutMs,
    respectRobots: options.respectRobots,
    dynamic: "auto",
  });

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH
          || (process.env.SCRAPLING_WORKER_RESOURCE_DIR ? path.join(process.env.SCRAPLING_WORKER_RESOURCE_DIR, "browser-runtime") : undefined),
      },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ ok: false, error: `Scrapling worker timed out after ${options.timeoutMs}ms`, warnings: [stderr.trim()].filter(Boolean) });
    }, options.timeoutMs + 5000);

    child.stdout.on("data", chunk => { stdout = appendLimited(stdout, chunk); });
    child.stderr.on("data", chunk => { stderr = appendLimited(stderr, chunk); });
    child.on("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, error: error.message, warnings: [stderr.trim()].filter(Boolean) });
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const parsed = parseWorkerOutput(stdout);
        if (stderr.trim()) parsed.warnings = [...(parsed.warnings || []), stderr.trim()];
        resolve(parsed);
      } catch (error: any) {
        resolve({ ok: false, error: error?.message || "Scrapling worker returned invalid JSON", warnings: [stderr.trim(), stdout.slice(0, 500)].filter(Boolean) });
      }
    });
    child.stdin.end(payload);
  });
}

function uniqueSubpageKey(subpages: ScrapeResult["subpages"], requestedKey: string) {
  let key = requestedKey;
  let suffix = 2;
  while (subpages[key]) {
    key = `${requestedKey}_${suffix}`;
    suffix++;
  }
  return key;
}

function convertWorkerResult(url: string, worker: WorkerResult, startedAt: number, modeRequested: ScrapeMode, maxPages: number): ScrapeResult {
  const pages = (worker.pages || [])
    .filter(page => page.url && page.text)
    .slice(0, maxPages)
    .map(page => ({
      ...page,
      pageType: normalizeWorkerPageType(page.pageType),
      text: page.text.substring(0, MAX_TEXT_LENGTH),
    })) as ScrapePage[];
  const homepage = pages.find(page => page.pageType === "homepage") || pages[0] || null;
  const subpages: ScrapeResult["subpages"] = {};
  for (const page of pages) {
    if (page === homepage) continue;
    const requestedKey = page.pageType === "other" ? `page_${Object.keys(subpages).length + 1}` : page.pageType;
    const key = uniqueSubpageKey(subpages, requestedKey);
    subpages[key] = {
      url: page.url,
      text: page.text,
      metadata: {
        title: page.title || "",
        description: "",
        keywords: "",
        language: "",
        headings: page.headings || [],
      },
    };
  }
  const evidence = (worker.evidence?.length ? worker.evidence : pages.flatMap(buildEvidenceFromPage)).slice(0, 80);
  const textChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  return {
    url,
    homepage: homepage?.text || null,
    subpages,
    metadata: homepage ? {
      title: homepage.title || "",
      description: "",
      keywords: "",
      language: "",
      headings: homepage.headings || [],
    } : null,
    error: worker.ok ? null : (workerErrorMessage(worker.error) || "Deep scraping failed"),
    pages,
    evidence,
    stats: {
      pagesFetched: worker.stats?.pagesFetched ?? pages.length,
      pagesAttempted: worker.stats?.pagesAttempted ?? pages.length,
      textChars: worker.stats?.textChars ?? textChars,
      durationMs: worker.stats?.durationMs ?? Date.now() - startedAt,
      usedWorker: true,
    },
    modeRequested,
    modeUsed: "deep",
    warnings: worker.warnings || [],
  };
}

export async function scrapeWebsite(websiteUrl: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
  const mode = options.mode || "auto";
  const maxPages = options.maxPages || DEFAULT_DEEP_MAX_PAGES;
  const timeoutMs = options.timeoutMs || DEFAULT_DEEP_TIMEOUT_MS;
  const respectRobots = options.respectRobots ?? true;
  const fallbackToFast = options.fallbackToFast ?? true;

  if (mode === "fast") {
    return scrapeWebsiteFast(websiteUrl, mode);
  }

  if (mode === "deep") {
    const startedAt = Date.now();
    const worker = await runScraplingWorker(normalizeWebsiteUrl(websiteUrl), { maxPages, timeoutMs, respectRobots });
    if (worker.ok && worker.pages?.length) return convertWorkerResult(normalizeWebsiteUrl(websiteUrl), worker, startedAt, mode, maxPages);
    if (!fallbackToFast) {
      return {
        url: normalizeWebsiteUrl(websiteUrl),
        homepage: null,
        subpages: {},
        metadata: null,
        error: workerErrorMessage(worker.error) || "Deep scraping failed",
        pages: [],
        evidence: [],
        stats: {
          pagesFetched: 0,
          pagesAttempted: 0,
          textChars: 0,
          durationMs: Date.now() - startedAt,
          usedWorker: true,
        },
        modeRequested: mode,
        modeUsed: "deep",
        warnings: worker.warnings || [],
      };
    }

    const fastResult = await scrapeWebsiteFast(websiteUrl, mode);
    return {
      ...fastResult,
      warnings: [
        ...fastResult.warnings,
        "Deep scraping failed; fell back to fast scraping.",
        workerErrorMessage(worker.error),
        ...(worker.warnings || []),
      ].filter(Boolean),
    };
  }

  const fastResult = await scrapeWebsiteFast(websiteUrl, mode);
  if (isFastResultEnough(fastResult)) {
    return fastResult;
  }

  const startedAt = Date.now();
  const worker = await runScraplingWorker(fastResult.url || normalizeWebsiteUrl(websiteUrl), { maxPages, timeoutMs, respectRobots });
  if (worker.ok && worker.pages?.length) {
    const deepResult = convertWorkerResult(fastResult.url || normalizeWebsiteUrl(websiteUrl), worker, startedAt, mode, maxPages);
    if (deepResult.stats.textChars >= Math.max(1200, fastResult.stats.textChars * 0.8)) {
      return deepResult;
    }
    return {
      ...fastResult,
      warnings: [
        ...fastResult.warnings,
        "Deep scraping returned less usable text than fast scraping; kept fast result.",
        ...(worker.warnings || []),
      ],
    };
  }

  return {
    ...fastResult,
    warnings: [
      ...fastResult.warnings,
      "Deep scraping unavailable; used fast scraping.",
      workerErrorMessage(worker.error),
      ...(worker.warnings || []),
    ].filter(Boolean),
  };
}

export function formatScrapingResults(results: ScrapeResult): string {
  let text = `=== Website Analysis: ${results.url} ===\n`;
  text += `Mode: requested=${results.modeRequested}, used=${results.modeUsed}\nPages fetched: ${results.stats.pagesFetched}/${results.stats.pagesAttempted}\n`;
  if (results.warnings.length) text += `Warnings: ${results.warnings.join(" | ")}\n`;
  text += "\n";

  if (results.metadata) {
    text += `--- Homepage Metadata ---\nTitle: ${results.metadata.title}\nDescription: ${results.metadata.description}\nLanguage: ${results.metadata.language}\n`;
    if (results.metadata.headings.length > 0) text += `Key Headings: ${results.metadata.headings.join(" | ")}\n`;
    text += "\n";
  }

  if (results.evidence.length) {
    text += "--- Source Evidence For Non-Mass-Mail Hooks ---\n";
    for (const item of results.evidence.slice(0, 25)) {
      text += `- [${item.type}] ${item.text} (source: ${item.sourceUrl})\n`;
    }
    text += "\n";
  }

  if (results.homepage) text += `--- Homepage Content ---\n${results.homepage.substring(0, 3000)}\n\n`;
  for (const [key, page] of Object.entries(results.subpages)) {
    text += `--- ${key.toUpperCase()} Page (${page.url}) ---\n`;
    if (page.metadata?.title) text += `Title: ${page.metadata.title}\n`;
    text += `${page.text.substring(0, 2000)}\n\n`;
  }
  return text;
}
