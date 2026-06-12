# Scrapling Worker

This worker is the Python sidecar for deep website research. It reads one JSON object from stdin and writes one JSON object to stdout. It is designed so the Electron/Node app can spawn it without requiring users to install Python manually once it is bundled.

## Install for development

```bash
pip install -r workers/scrapling_worker/requirements.txt
scrapling install
```

Scrapling's base install does not include fetcher or browser dependencies, so both commands are required for full static and dynamic fetching.

## Input

```json
{
  "url": "https://example.com",
  "maxPages": 30,
  "timeoutMs": 90000,
  "respectRobots": true,
  "dynamic": "auto",
  "pageTextLimit": 8000
}
```

Fields:

- `url`: Required. Domain or http(s) URL.
- `maxPages`: Optional. Default 30, capped at 80.
- `timeoutMs`: Optional. Default 90000, capped at 300000.
- `respectRobots`: Optional. Default true.
- `dynamic`: Optional. `auto`, `always`, or `never`.
- `pageTextLimit`: Optional. Default 8000 chars per page.

## Output

```json
{
  "ok": true,
  "pages": [
    {
      "url": "https://example.com/",
      "title": "Example",
      "description": "...",
      "text": "...",
      "headings": ["..."],
      "pageType": "home",
      "fetchedBy": "static",
      "status": 200
    }
  ],
  "evidence": [
    {
      "type": "product_line",
      "sourceUrl": "https://example.com/products",
      "text": "...",
      "confidence": 0.72
    }
  ],
  "stats": {
    "startedUrl": "https://example.com",
    "normalizedUrl": "https://example.com/",
    "rootHost": "example.com",
    "maxPages": 30,
    "timeoutMs": 90000,
    "respectRobots": true,
    "dynamic": "auto",
    "pagesFetched": 3,
    "pagesDiscovered": 12,
    "pagesSkipped": 4,
    "fetchErrors": 0,
    "durationMs": 1234
  },
  "warnings": []
}
```

If Scrapling or its fetcher dependencies are missing, stdout still contains JSON with `ok: false` and `error.code` such as `SCRAPLING_MISSING` or `SCRAPLING_FETCHERS_MISSING`. Do not parse stderr for application behavior.

## Crawl policy

- Only crawls the input host and same-site subdomains.
- Skips mail, phone, JavaScript, fragment-only, binary, and cross-site URLs.
- Respects robots.txt when `respectRobots` is true. If robots.txt is unavailable, the worker warns and continues.
- Prioritizes product, application, case study, certification, about, contact, news, and FAQ pages.
- Uses Scrapling static fetching first. In `dynamic: "auto"` mode, it tries `DynamicFetcher` when a page has too little text or static fetching fails.
