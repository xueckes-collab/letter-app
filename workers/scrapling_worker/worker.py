from __future__ import annotations

import heapq
import html
import json
import re
import socket
import sys
import time
import traceback
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any, Callable
from urllib.parse import urldefrag, urljoin, urlsplit, urlunsplit
from urllib.request import Request as UrlRequest
from urllib.request import urlopen
from urllib.robotparser import RobotFileParser


DEFAULT_MAX_PAGES = 30
DEFAULT_TIMEOUT_MS = 90_000
DEFAULT_PAGE_TEXT_LIMIT = 8_000
HARD_MAX_PAGES = 80
HARD_TIMEOUT_MS = 300_000
MIN_DYNAMIC_TEXT_LENGTH = 700
MAX_EVIDENCE_ITEMS = 40
MAX_LINKS_PER_PAGE = 250
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


PAGE_TYPE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("products", ("product", "products", "collection", "collections", "catalog", "category", "shop", "solution", "solutions")),
    ("applications", ("application", "applications", "industries", "industry", "use-cases", "usecase")),
    ("case_studies", ("case", "cases", "project", "projects", "portfolio", "gallery", "reference", "references")),
    ("certifications", ("certificate", "certification", "certified", "compliance", "quality", "sustainability", "environment", "iso", "fsc", "sedex", "bsci")),
    ("about", ("about", "company", "who-we-are", "our-story", "factory", "manufacturing")),
    ("news", ("news", "blog", "article", "insight", "press")),
    ("contact", ("contact", "get-in-touch", "reach-us", "distributor", "dealer")),
    ("faq", ("faq", "support", "help")),
]

PAGE_TYPE_PRIORITY = {
    "products": 100,
    "applications": 95,
    "case_studies": 90,
    "certifications": 85,
    "about": 80,
    "contact": 70,
    "news": 55,
    "faq": 50,
    "home": 40,
    "other": 10,
}

EVIDENCE_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("product_line", ("product", "collection", "catalog", "solution", "material", "equipment", "service", "custom")),
    ("application", ("application", "used in", "industries", "industry", "market", "sector", "project")),
    ("certification", ("iso", "ce ", "fda", "fsc", "sgs", "rohs", "reach", "sedex", "bsci", "certified", "certification", "compliance")),
    ("capability", ("oem", "odm", "private label", "customized", "customization", "factory", "manufacturing", "capacity", "lead time", "moq")),
    ("market_signal", ("distributor", "wholesale", "retail", "export", "global", "north america", "europe", "australia", "middle east")),
    ("case_study", ("case study", "project", "portfolio", "client", "customer", "reference")),
    ("contact", ("email", "phone", "address", "contact us", "@")),
]


class WorkerError(Exception):
    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() in {"script", "style", "noscript", "iframe", "svg"}:
            self.skip_depth += 1
        if tag.lower() in {"p", "div", "section", "article", "br", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "noscript", "iframe", "svg"} and self.skip_depth:
            self.skip_depth -= 1
        if tag.lower() in {"p", "div", "section", "article", "li", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip_depth:
            self.parts.append(data)

    def text(self) -> str:
        return clean_text(" ".join(self.parts))


class LinkExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        for name, value in attrs:
            if name.lower() == "href" and value:
                self.links.append(value)


@dataclass
class WorkerInput:
    url: str
    max_pages: int
    timeout_ms: int
    respect_robots: bool
    dynamic: str
    page_text_limit: int


@dataclass
class FetchResult:
    page: Any | None
    fetched_by: str | None
    warning: str | None = None
    error: str | None = None


def emit_json(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    sys.stdout.flush()


def clean_text(value: str, limit: int | None = None) -> str:
    value = html.unescape(value or "")
    value = value.replace("\x00", " ")
    value = re.sub(r"[ \t\r\f\v]+", " ", value)
    value = re.sub(r"\n\s*\n+", "\n", value)
    value = value.strip()
    if limit and len(value) > limit:
        return value[:limit].rstrip()
    return value


def selector_values(page: Any, selector: str) -> list[str]:
    try:
        selected = page.css(selector)
        if hasattr(selected, "getall"):
            values = selected.getall()
        else:
            values = list(selected)
    except Exception:
        return []
    cleaned: list[str] = []
    for value in values:
        if value is None:
            continue
        text = clean_text(str(value))
        if text:
            cleaned.append(text)
    return cleaned


def first_selector_value(page: Any, selector: str) -> str:
    values = selector_values(page, selector)
    return values[0] if values else ""


def page_html(page: Any) -> str:
    for attr in ("html", "body", "content"):
        try:
            value = getattr(page, attr, None)
            if callable(value):
                value = value()
            if value:
                return str(value)
        except Exception:
            continue
    try:
        return str(page)
    except Exception:
        return ""


def fallback_text_from_html(markup: str) -> str:
    parser = TextExtractor()
    try:
        parser.feed(markup)
        parser.close()
        return parser.text()
    except Exception:
        return clean_text(re.sub(r"<[^>]+>", " ", markup))


def fallback_links_from_html(markup: str) -> list[str]:
    parser = LinkExtractor()
    try:
        parser.feed(markup)
        parser.close()
        return parser.links
    except Exception:
        return []


def normalize_url(raw_url: str, base_url: str | None = None) -> str | None:
    if not raw_url:
        return None
    raw_url = raw_url.strip()
    if raw_url.startswith(("mailto:", "tel:", "javascript:", "#")):
        return None
    if base_url:
        raw_url = urljoin(base_url, raw_url)
    if not re.match(r"^https?://", raw_url, re.I):
        raw_url = "https://" + raw_url
    raw_url, _fragment = urldefrag(raw_url)
    parts = urlsplit(raw_url)
    if parts.scheme not in {"http", "https"} or not parts.netloc:
        return None
    host = parts.netloc.lower()
    path = re.sub(r"/{2,}", "/", parts.path or "/")
    normalized = urlunsplit((parts.scheme.lower(), host, path, "", ""))
    return normalized


def hostname(url: str) -> str:
    return urlsplit(url).hostname or ""


def comparable_host(host: str) -> str:
    host = host.lower().strip(".")
    return host[4:] if host.startswith("www.") else host


def is_same_site(url: str, root_host: str) -> bool:
    candidate = comparable_host(hostname(url))
    root = comparable_host(root_host)
    return candidate == root or candidate.endswith("." + root)


def classify_page(url: str, title: str = "") -> str:
    parts = urlsplit(url)
    if parts.path in {"", "/"}:
        return "home"
    haystack = f"{parts.path} {title}".lower()
    for page_type, keywords in PAGE_TYPE_RULES:
        if any(keyword in haystack for keyword in keywords):
            return page_type
    return "other"


def page_score(url: str, title: str = "") -> int:
    page_type = classify_page(url, title)
    score = PAGE_TYPE_PRIORITY.get(page_type, 10)
    path = urlsplit(url).path.lower()
    depth = len([part for part in path.split("/") if part])
    if depth > 3:
        score -= 10
    if any(ext in path for ext in (".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".zip")):
        score -= 100
    return score


def validate_input(raw: Any) -> WorkerInput:
    if not isinstance(raw, dict):
        raise WorkerError("INVALID_INPUT", "Input must be a JSON object.")
    raw_url = raw.get("url")
    if not isinstance(raw_url, str) or not raw_url.strip():
        raise WorkerError("INVALID_INPUT", "Input.url is required.")
    normalized = normalize_url(raw_url)
    if not normalized:
        raise WorkerError("INVALID_INPUT", "Input.url must be an http(s) URL or domain.")

    max_pages = raw.get("maxPages", DEFAULT_MAX_PAGES)
    timeout_ms = raw.get("timeoutMs", DEFAULT_TIMEOUT_MS)
    page_text_limit = raw.get("pageTextLimit", DEFAULT_PAGE_TEXT_LIMIT)
    dynamic = raw.get("dynamic", "auto")
    respect_robots = raw.get("respectRobots", True)

    if not isinstance(max_pages, int):
        raise WorkerError("INVALID_INPUT", "Input.maxPages must be an integer.")
    if not isinstance(timeout_ms, int):
        raise WorkerError("INVALID_INPUT", "Input.timeoutMs must be an integer.")
    if not isinstance(page_text_limit, int):
        raise WorkerError("INVALID_INPUT", "Input.pageTextLimit must be an integer.")
    if dynamic not in {"auto", "always", "never"}:
        raise WorkerError("INVALID_INPUT", "Input.dynamic must be one of: auto, always, never.")

    return WorkerInput(
        url=normalized,
        max_pages=max(1, min(max_pages, HARD_MAX_PAGES)),
        timeout_ms=max(5_000, min(timeout_ms, HARD_TIMEOUT_MS)),
        respect_robots=bool(respect_robots),
        dynamic=dynamic,
        page_text_limit=max(500, min(page_text_limit, 30_000)),
    )


def load_scrapling() -> tuple[Any | None, Any | None, str | None, str | None]:
    try:
        from scrapling.fetchers import Fetcher  # type: ignore
    except ModuleNotFoundError as exc:
        missing = exc.name or "scrapling"
        code = "SCRAPLING_MISSING" if missing == "scrapling" else "SCRAPLING_FETCHERS_MISSING"
        return None, None, code, missing
    except Exception as exc:
        return None, None, "SCRAPLING_IMPORT_ERROR", str(exc)

    try:
        from scrapling.fetchers import DynamicFetcher  # type: ignore
    except Exception:
        DynamicFetcher = None

    return Fetcher, DynamicFetcher, None, None


def fetch_with_static(fetcher: Any, url: str, timeout_seconds: float) -> Any:
    attempts: list[Callable[[], Any]] = [
        lambda: fetcher.get(url, stealthy_headers=True, impersonate="chrome", timeout=timeout_seconds),
        lambda: fetcher.get(url, stealthy_headers=True, impersonate="chrome"),
        lambda: fetcher.get(url, stealthy_headers=True),
        lambda: fetcher.get(url),
    ]
    last_error: Exception | None = None
    for attempt in attempts:
        try:
            return attempt()
        except TypeError as exc:
            last_error = exc
            continue
    if last_error:
        raise last_error
    raise RuntimeError("Static fetch failed without an exception.")


def fetch_with_dynamic(dynamic_fetcher: Any, url: str, timeout_seconds: float) -> Any:
    timeout_ms = max(1_000, int(timeout_seconds * 1_000))
    attempts: list[Callable[[], Any]] = [
        lambda: dynamic_fetcher.fetch(url, headless=True, network_idle=True, timeout=timeout_ms),
        lambda: dynamic_fetcher.fetch(url, headless=True, network_idle=True),
        lambda: dynamic_fetcher.fetch(url, headless=True),
        lambda: dynamic_fetcher.fetch(url),
    ]
    last_error: Exception | None = None
    for attempt in attempts:
        try:
            return attempt()
        except TypeError as exc:
            last_error = exc
            continue
    if last_error:
        raise last_error
    raise RuntimeError("Dynamic fetch failed without an exception.")


def extract_page(page: Any, url: str, fetched_by: str, text_limit: int) -> dict[str, Any]:
    markup = page_html(page)
    title = first_selector_value(page, "title::text")
    description = first_selector_value(page, 'meta[name="description"]::attr(content)')
    headings = selector_values(page, "h1::text") + selector_values(page, "h2::text") + selector_values(page, "h3::text")
    body_parts = selector_values(page, "body ::text")
    text = clean_text(" ".join(body_parts), text_limit)
    if len(text) < 80:
        text = clean_text(fallback_text_from_html(markup), text_limit)

    final_title = title[:220]
    return {
        "url": url,
        "title": final_title,
        "description": description[:500],
        "text": text,
        "headings": list(dict.fromkeys([h[:200] for h in headings if h]))[:30],
        "pageType": classify_page(url, final_title),
        "fetchedBy": fetched_by,
        "status": getattr(page, "status", None) or getattr(page, "status_code", None),
    }


def extract_links(page: Any, url: str) -> list[str]:
    links = selector_values(page, "a::attr(href)")
    if not links:
        links = fallback_links_from_html(page_html(page))
    normalized: list[str] = []
    seen: set[str] = set()
    for href in links[:MAX_LINKS_PER_PAGE]:
        next_url = normalize_url(href, url)
        if next_url and next_url not in seen:
            seen.add(next_url)
            normalized.append(next_url)
    return normalized


def fetch_page(fetcher: Any, dynamic_fetcher: Any | None, url: str, dynamic: str, deadline: float) -> FetchResult:
    remaining = max(1.0, deadline - time.monotonic())
    per_fetch_timeout = min(25.0, remaining)

    if dynamic == "always":
        if dynamic_fetcher is None:
            return FetchResult(None, None, error="DynamicFetcher is unavailable. Run scrapling install and package browser dependencies.")
        try:
            return FetchResult(fetch_with_dynamic(dynamic_fetcher, url, per_fetch_timeout), "dynamic")
        except Exception as exc:
            return FetchResult(None, None, error=f"dynamic fetch failed: {exc}")

    try:
        page = fetch_with_static(fetcher, url, per_fetch_timeout)
        extracted_text = clean_text(" ".join(selector_values(page, "body ::text")))
        if dynamic == "auto" and dynamic_fetcher is not None and len(extracted_text) < MIN_DYNAMIC_TEXT_LENGTH:
            try:
                dynamic_page = fetch_with_dynamic(dynamic_fetcher, url, per_fetch_timeout)
                dynamic_text = clean_text(" ".join(selector_values(dynamic_page, "body ::text")))
                if len(dynamic_text) > len(extracted_text):
                    return FetchResult(dynamic_page, "dynamic", warning=f"used dynamic fetcher for low-text page: {url}")
            except Exception as exc:
                return FetchResult(page, "static", warning=f"dynamic fallback failed for {url}: {exc}")
        return FetchResult(page, "static")
    except Exception as static_exc:
        if dynamic == "auto" and dynamic_fetcher is not None:
            try:
                return FetchResult(fetch_with_dynamic(dynamic_fetcher, url, per_fetch_timeout), "dynamic", warning=f"static fetch failed, dynamic succeeded for {url}")
            except Exception as dynamic_exc:
                return FetchResult(None, None, error=f"static fetch failed: {static_exc}; dynamic fetch failed: {dynamic_exc}")
        return FetchResult(None, None, error=f"static fetch failed: {static_exc}")


def load_robots(start_url: str, timeout_seconds: float, warnings: list[str]) -> RobotFileParser | None:
    parts = urlsplit(start_url)
    robots_url = urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        request = UrlRequest(robots_url, headers={"User-Agent": USER_AGENT})
        with urlopen(request, timeout=min(timeout_seconds, 8.0)) as response:
            body = response.read(512_000).decode("utf-8", errors="replace").splitlines()
        parser.parse(body)
        return parser
    except Exception as exc:
        warnings.append(f"robots.txt unavailable, proceeding without robots rules: {exc}")
        return None


def split_sentences(text: str) -> list[str]:
    rough = re.split(r"(?<=[.!?。！？])\s+|\n+", text)
    sentences = [clean_text(part) for part in rough]
    return [sentence for sentence in sentences if 40 <= len(sentence) <= 260]


def build_evidence(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for page in pages:
        source_url = str(page.get("url", ""))
        page_type = str(page.get("pageType", "other"))
        title = clean_text(str(page.get("title", "")))
        if title:
            key = ("page_title", title.lower())
            if key not in seen:
                evidence.append({"type": "page_title", "sourceUrl": source_url, "text": title, "confidence": 0.65})
                seen.add(key)

        for sentence in split_sentences(str(page.get("text", ""))):
            lower = sentence.lower()
            matched_type = ""
            for evidence_type, keywords in EVIDENCE_RULES:
                if any(keyword in lower for keyword in keywords):
                    matched_type = evidence_type
                    break
            if not matched_type and page_type in {"about", "products", "case_studies", "certifications", "applications"}:
                matched_type = page_type
            if not matched_type:
                continue
            key = (matched_type, sentence.lower())
            if key in seen:
                continue
            seen.add(key)
            confidence = 0.82 if matched_type in {"certification", "contact", "case_study"} else 0.72
            evidence.append({"type": matched_type, "sourceUrl": source_url, "text": sentence, "confidence": confidence})
            if len(evidence) >= MAX_EVIDENCE_ITEMS:
                return evidence
    return evidence


def crawl(payload: WorkerInput) -> dict[str, Any]:
    started_at = time.monotonic()
    deadline = started_at + payload.timeout_ms / 1000.0
    warnings: list[str] = []
    stats: dict[str, Any] = {
        "startedUrl": payload.url,
        "normalizedUrl": payload.url,
        "rootHost": hostname(payload.url),
        "maxPages": payload.max_pages,
        "timeoutMs": payload.timeout_ms,
        "respectRobots": payload.respect_robots,
        "dynamic": payload.dynamic,
        "pagesFetched": 0,
        "pagesDiscovered": 0,
        "pagesSkipped": 0,
        "fetchErrors": 0,
        "durationMs": 0,
    }

    Fetcher, DynamicFetcher, import_code, import_detail = load_scrapling()
    if import_code:
        return {
            "ok": False,
            "pages": [],
            "evidence": [],
            "stats": stats,
            "warnings": warnings,
            "error": {
                "code": import_code,
                "message": "Scrapling fetcher dependencies are not available.",
                "details": {
                    "missing": import_detail,
                    "install": 'pip install -r workers/scrapling_worker/requirements.txt && scrapling install',
                },
            },
        }

    socket.setdefaulttimeout(min(25.0, payload.timeout_ms / 1000.0))
    robots = load_robots(payload.url, payload.timeout_ms / 1000.0, warnings) if payload.respect_robots else None
    crawl_delay = 0.25
    if robots:
        try:
            robots_delay = robots.crawl_delay(USER_AGENT) or robots.crawl_delay("*")
            if robots_delay:
                crawl_delay = min(float(robots_delay), 5.0)
        except Exception:
            pass

    root_host = hostname(payload.url)
    pages: list[dict[str, Any]] = []
    visited: set[str] = set()
    queued: set[str] = {payload.url}
    queue: list[tuple[int, int, str]] = []
    sequence = 0
    heapq.heappush(queue, (-PAGE_TYPE_PRIORITY["home"], sequence, payload.url))

    while queue and len(pages) < payload.max_pages:
        if time.monotonic() >= deadline:
            warnings.append("crawl timeout reached")
            break
        _priority, _sequence, current_url = heapq.heappop(queue)
        queued.discard(current_url)
        if current_url in visited:
            continue
        visited.add(current_url)

        if robots and not robots.can_fetch(USER_AGENT, current_url):
            stats["pagesSkipped"] += 1
            warnings.append(f"robots.txt disallowed: {current_url}")
            continue

        result = fetch_page(Fetcher, DynamicFetcher, current_url, payload.dynamic, deadline)
        if result.warning:
            warnings.append(result.warning)
        if not result.page or not result.fetched_by:
            stats["fetchErrors"] += 1
            if result.error:
                warnings.append(f"{current_url}: {result.error}")
            continue

        extracted = extract_page(result.page, current_url, result.fetched_by, payload.page_text_limit)
        if extracted["text"] or extracted["title"]:
            pages.append(extracted)
            stats["pagesFetched"] = len(pages)

        for link in extract_links(result.page, current_url):
            if link in visited or link in queued:
                continue
            if not is_same_site(link, root_host):
                stats["pagesSkipped"] += 1
                continue
            if page_score(link) < 0:
                stats["pagesSkipped"] += 1
                continue
            sequence += 1
            queued.add(link)
            heapq.heappush(queue, (-page_score(link), sequence, link))
            stats["pagesDiscovered"] += 1
        if queue and crawl_delay:
            time.sleep(min(crawl_delay, max(0.0, deadline - time.monotonic())))

    stats["durationMs"] = int((time.monotonic() - started_at) * 1000)
    return {
        "ok": bool(pages),
        "pages": pages,
        "evidence": build_evidence(pages),
        "stats": stats,
        "warnings": warnings[:80],
        "error": None if pages else {"code": "NO_PAGES_FETCHED", "message": "No pages could be fetched from the target website."},
    }


def error_response(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "ok": False,
        "pages": [],
        "evidence": [],
        "stats": {"durationMs": 0},
        "warnings": [],
        "error": {"code": code, "message": message, "details": details or {}},
    }


def main() -> None:
    try:
        raw = sys.stdin.read()
        if not raw.strip():
            emit_json(error_response("INVALID_INPUT", "Expected a JSON object on stdin."))
            return
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            emit_json(error_response("INVALID_JSON", "stdin did not contain valid JSON.", {"position": exc.pos}))
            return
        try:
            payload = validate_input(parsed)
        except WorkerError as exc:
            emit_json(error_response(exc.code, exc.message, exc.details))
            return
        emit_json(crawl(payload))
    except Exception as exc:
        emit_json(
            error_response(
                "WORKER_UNHANDLED_ERROR",
                str(exc),
                {"trace": traceback.format_exc(limit=6)},
            )
        )


if __name__ == "__main__":
    main()
