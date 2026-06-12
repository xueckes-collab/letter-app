import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScrapeResult } from "./services/scraper";

const { existsSyncMock, spawnMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  spawnMock: vi.fn(),
}));

type WorkerResult = {
  ok: boolean;
  pages?: Array<{
    url: string;
    title: string;
    text: string;
    headings: string[];
    pageType: string;
  }>;
  evidence?: Array<{
    type: string;
    sourceUrl: string;
    text: string;
    confidence: number;
  }>;
  stats?: Record<string, unknown>;
  warnings?: string[];
  error?: string;
};

function html(body: string, title = "Test Site") {
  return `<!doctype html><html lang="en"><head><title>${title}</title><meta name="description" content="Test description"></head><body>${body}</body></html>`;
}

function mockFetchPages(pages: Record<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      const body = pages[url] ?? pages[url.replace(/\/$/, "")] ?? pages["*"];

      if (!body) {
        return new Response("missing", {
          status: 404,
          headers: { "content-type": "text/html" },
        });
      }

      return new Response(body, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }),
  );
}

function createWorkerProcess(options: {
  stdout?: WorkerResult;
  stderr?: string;
  exitCode?: number;
  neverClose?: boolean;
}) {
  const proc = new EventEmitter() as EventEmitter & {
    stdin: PassThrough;
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
  };

  proc.stdin = new PassThrough();
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn(() => {
    proc.emit("close", null, "SIGTERM");
    return true;
  });

  if (!options.neverClose) {
    setTimeout(() => {
      if (options.stdout) proc.stdout.end(JSON.stringify(options.stdout));
      if (options.stderr) proc.stderr.end(options.stderr);
      proc.emit("close", options.exitCode ?? 0);
    }, 0);
  }

  return proc;
}

async function loadScraper() {
  vi.doMock("node:fs", () => ({
    default: { existsSync: existsSyncMock },
    existsSync: existsSyncMock,
  }));
  vi.doMock("node:child_process", () => ({ spawn: spawnMock }));
  vi.doMock("child_process", () => ({ spawn: spawnMock }));
  return await import("./services/scraper");
}

const deepWorkerResult: WorkerResult = {
  ok: true,
  pages: [
    {
      url: "https://buyer.example/about",
      title: "About Buyer Example",
      text: "Buyer Example supplies commercial flooring projects for hotel renovation contractors.",
      headings: ["Commercial flooring partner", "Hotel renovation supply"],
      pageType: "about",
    },
    {
      url: "https://buyer.example/certifications",
      title: "Certifications",
      text: "The team asks suppliers for FloorScore certificates and low-VOC documentation.",
      headings: ["Supplier certification requirements"],
      pageType: "certifications",
    },
  ],
  evidence: [
    {
      type: "business_model",
      sourceUrl: "https://buyer.example/about",
      text: "Supplies commercial flooring projects for hotel renovation contractors.",
      confidence: 0.92,
    },
    {
      type: "purchase_signal",
      sourceUrl: "https://buyer.example/certifications",
      text: "Asks suppliers for FloorScore certificates and low-VOC documentation.",
      confidence: 0.88,
    },
  ],
  stats: { pagesFetched: 2, pagesAttempted: 2, textChars: 1800, mode: "deep" },
  warnings: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock("node:fs");
  vi.doUnmock("node:child_process");
  vi.doUnmock("child_process");
  vi.resetModules();
  vi.clearAllMocks();
});

describe("scrapeWebsite fast/deep/auto contract", () => {
  beforeEach(() => {
    existsSyncMock.mockReturnValue(true);
    vi.stubEnv("SCRAPLING_WORKER_PATH", "C:\\fake\\scrapling-worker\\worker.py");
  });

  it("keeps fast mode lightweight and compatible with the current homepage/subpage scrape", async () => {
    const { scrapeWebsite } = await loadScraper();
    mockFetchPages({
      "https://buyer.example": html(
        `<h1>Buyer Example</h1><a href="/about">About us</a><p>Importer of resilient flooring for commercial projects.</p>`,
      ),
      "https://buyer.example/about": html(
        `<h1>About us</h1><p>We serve hotel contractors and regional distributors.</p>`,
      ),
    });

    const result = (await scrapeWebsite("https://buyer.example", { mode: "fast" } as never)) as ScrapeResult & {
      modeUsed?: string;
      pages?: unknown[];
    };

    expect(spawnMock).not.toHaveBeenCalled();
    expect(result.modeUsed).toBe("fast");
    expect(result.homepage).toContain("Importer of resilient flooring");
    expect(result.subpages.about?.text).toContain("hotel contractors");
    expect(result.pages?.[0]).toMatchObject({
      url: "https://buyer.example",
      pageType: "homepage",
    });
  });

  it("promotes auto mode to the deep worker when the fast scrape is too thin", async () => {
    const { scrapeWebsite } = await loadScraper();
    mockFetchPages({
      "https://buyer.example": html(`<h1>Buyer Example</h1><p>Loading...</p>`),
    });
    spawnMock.mockReturnValue(createWorkerProcess({ stdout: deepWorkerResult }));

    const result = (await scrapeWebsite("https://buyer.example", { mode: "auto" } as never)) as ScrapeResult & {
      modeUsed?: string;
      evidence?: WorkerResult["evidence"];
      pages?: WorkerResult["pages"];
      stats?: WorkerResult["stats"];
      warnings?: string[];
    };

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(result.modeUsed).toBe("deep");
    expect(result.pages).toHaveLength(2);
    expect(result.evidence).toEqual(deepWorkerResult.evidence);
    expect(result.stats).toMatchObject({ pagesFetched: 2 });
    expect(result.warnings ?? []).toEqual([]);
  });

  it("uses the deep worker directly in deep mode when it succeeds", async () => {
    const { scrapeWebsite } = await loadScraper();
    mockFetchPages({
      "https://buyer.example": html(`<h1>Buyer Example</h1><p>Loading...</p>`),
    });
    spawnMock.mockReturnValue(createWorkerProcess({ stdout: deepWorkerResult }));

    const result = await scrapeWebsite("https://buyer.example", { mode: "deep" } as never);

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(result.modeUsed).toBe("deep");
    expect(result.homepage).toContain("commercial flooring projects");
  });

  it("falls back to fast results and records a warning when the deep worker fails", async () => {
    const { scrapeWebsite } = await loadScraper();
    mockFetchPages({
      "https://buyer.example": html(
        `<h1>Buyer Example</h1><p>Static fallback content for flooring importers.</p>`,
      ),
    });
    spawnMock.mockReturnValue(
      createWorkerProcess({
        stdout: { ok: false, error: "Scrapling worker failed", warnings: ["browser launch failed"] },
        stderr: "browser launch failed",
        exitCode: 1,
      }),
    );

    const result = (await scrapeWebsite("https://buyer.example", { mode: "deep" } as never)) as ScrapeResult & {
      modeUsed?: string;
      warnings?: string[];
    };

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(result.modeUsed).toBe("fast");
    expect(result.homepage).toContain("Static fallback content");
    expect(result.warnings?.join(" ")).toMatch(/worker|browser launch failed|fallback/i);
    expect(result.error).toBeNull();
  });

  it("kills the worker and falls back to fast results when deep scraping times out", async () => {
    const { scrapeWebsite } = await loadScraper();
    vi.useFakeTimers();
    mockFetchPages({
      "https://buyer.example": html(
        `<h1>Buyer Example</h1><p>Fallback content remains available after timeout.</p>`,
      ),
    });
    const worker = createWorkerProcess({ neverClose: true });
    spawnMock.mockReturnValue(worker);

    const scrapePromise = scrapeWebsite("https://buyer.example", {
      mode: "deep",
      timeoutMs: 25,
    } as never) as Promise<ScrapeResult & { modeUsed?: string; warnings?: string[] }>;

    await vi.advanceTimersByTimeAsync(5030);
    const result = await scrapePromise;

    expect(worker.kill).toHaveBeenCalled();
    expect(result.modeUsed).toBe("fast");
    expect(result.homepage).toContain("Fallback content remains available");
    expect(result.warnings?.join(" ")).toMatch(/timeout|timed out|fallback/i);
    expect(result.error).toBeNull();
  });
});

describe("formatScrapingResults deep evidence contract", () => {
  it("includes structured evidence and source URLs while preserving legacy text for analyzeWebsite", async () => {
    const { formatScrapingResults } = await loadScraper();
    const result = {
      url: "https://buyer.example",
      homepage: "Buyer Example imports commercial flooring for hotel renovation teams.",
      subpages: {
        products: {
          url: "https://buyer.example/products",
          text: "SPC and LVT products are requested for commercial projects.",
          metadata: {
            title: "Products",
            description: "",
            keywords: "",
            language: "en",
            headings: ["Commercial products"],
          },
        },
      },
      metadata: {
        title: "Buyer Example",
        description: "Commercial flooring importer",
        keywords: "",
        language: "en",
        headings: ["Hotel renovation flooring"],
      },
      error: null,
      pages: deepWorkerResult.pages,
      evidence: deepWorkerResult.evidence,
      stats: deepWorkerResult.stats,
      modeRequested: "deep",
      modeUsed: "deep",
      warnings: [],
    } as ScrapeResult & {
      pages: WorkerResult["pages"];
      evidence: WorkerResult["evidence"];
      stats: WorkerResult["stats"];
      modeUsed: string;
      warnings: string[];
    };

    const formatted = formatScrapingResults(result);

    expect(typeof formatted).toBe("string");
    expect(formatted).toContain("=== Website Analysis: https://buyer.example ===");
    expect(formatted).toContain("--- Homepage Content ---");
    expect(formatted).toContain("--- PRODUCTS Page (https://buyer.example/products) ---");
    expect(formatted).toMatch(/Source Evidence|Structured Evidence/i);
    expect(formatted).toContain("business_model");
    expect(formatted).toContain("https://buyer.example/about");
    expect(formatted).toContain("FloorScore certificates");
    expect(formatted).toMatch(/Mode: (deep|requested=deep, used=deep)/);
  });
});
