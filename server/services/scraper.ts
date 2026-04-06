import * as cheerio from 'cheerio';

const FETCH_TIMEOUT = 10000;
const MAX_PAGES = 6;
const MAX_TEXT_LENGTH = 8000;

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

const KEY_PAGE_PATTERNS = [
  { key: 'about', patterns: [/about/i, /who-we-are/i, /company/i, /our-story/i] },
  { key: 'products', patterns: [/products/i, /collections/i, /catalog/i, /shop/i, /flooring/i] },
  { key: 'contact', patterns: [/contact/i, /get-in-touch/i, /reach-us/i] },
  { key: 'projects', patterns: [/projects/i, /case-stud/i, /portfolio/i, /gallery/i, /references/i] },
  { key: 'certifications', patterns: [/certif/i, /sustainability/i, /environ/i, /green/i, /compliance/i] },
  { key: 'blog', patterns: [/blog/i, /news/i, /articles/i, /insights/i] },
];

async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
    const response = await fetch(url, { headers: HEADERS, signal: controller.signal, redirect: 'follow' });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;
    return await response.text();
  } catch { return null; }
}

function extractText($: cheerio.CheerioAPI): string {
  $('script, style, noscript, iframe, svg, nav, footer').remove();
  const text = $('body').text().replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  return text.substring(0, MAX_TEXT_LENGTH);
}

function findKeyPages($: cheerio.CheerioAPI, baseUrl: string): Map<string, string> {
  const links = new Map<string, string>();
  const base = new URL(baseUrl);
  $('a[href]').each((_: number, el: any) => {
    const href = $(el).attr('href');
    if (!href) return;
    try {
      const url = new URL(href, baseUrl);
      if (url.hostname !== base.hostname) return;
      const path = url.pathname.toLowerCase();
      const linkText = $(el).text().toLowerCase().trim();
      for (const { key, patterns } of KEY_PAGE_PATTERNS) {
        if (links.has(key)) continue;
        for (const pattern of patterns) {
          if (pattern.test(path) || pattern.test(linkText)) { links.set(key, url.toString()); break; }
        }
      }
    } catch { /* skip */ }
  });
  return links;
}

function extractMetadata($: cheerio.CheerioAPI, url: string) {
  const title = $('title').text().trim();
  const description = $('meta[name="description"]').attr('content') || '';
  const keywords = $('meta[name="keywords"]').attr('content') || '';
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';
  const lang = $('html').attr('lang') || '';
  const headings: string[] = [];
  $('h1, h2, h3').each((_: number, el: any) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });
  return { title: title || ogTitle, description: description || ogDescription, keywords, language: lang, headings: headings.slice(0, 20) };
}

export interface ScrapeResult {
  url: string;
  homepage: string | null;
  subpages: Record<string, { url: string; text: string; metadata: ReturnType<typeof extractMetadata> }>;
  metadata: ReturnType<typeof extractMetadata> | null;
  error: string | null;
}

export async function scrapeWebsite(websiteUrl: string): Promise<ScrapeResult> {
  let url = websiteUrl.trim();
  if (!url.startsWith('http')) url = 'https://' + url;

  const results: ScrapeResult = { url, homepage: null, subpages: {}, metadata: null, error: null };

  let homepageHtml = await fetchPage(url);
  if (!homepageHtml) {
    const wwwUrl = url.replace('https://', 'https://www.');
    homepageHtml = await fetchPage(wwwUrl);
    if (!homepageHtml) { results.error = 'Could not access website'; return results; }
    url = wwwUrl;
  }

  const $ = cheerio.load(homepageHtml);
  results.metadata = extractMetadata($, url);
  results.homepage = extractText($);

  const keyPages = findKeyPages($, url);
  let fetchedCount = 0;
  for (const [key, pageUrl] of Array.from(keyPages.entries())) {
    if (fetchedCount >= MAX_PAGES) break;
    await new Promise(r => setTimeout(r, 500));
    const html = await fetchPage(pageUrl);
    if (html) {
      const sub$ = cheerio.load(html);
      results.subpages[key] = { url: pageUrl, text: extractText(sub$), metadata: extractMetadata(sub$, pageUrl) };
      fetchedCount++;
    }
  }
  return results;
}

export function formatScrapingResults(results: ScrapeResult): string {
  let text = `=== Website Analysis: ${results.url} ===\n\n`;
  if (results.metadata) {
    text += `--- Homepage Metadata ---\nTitle: ${results.metadata.title}\nDescription: ${results.metadata.description}\nLanguage: ${results.metadata.language}\n`;
    if (results.metadata.headings.length > 0) text += `Key Headings: ${results.metadata.headings.join(' | ')}\n`;
    text += '\n';
  }
  if (results.homepage) text += `--- Homepage Content ---\n${results.homepage.substring(0, 3000)}\n\n`;
  for (const [key, page] of Object.entries(results.subpages)) {
    text += `--- ${key.toUpperCase()} Page (${page.url}) ---\n`;
    if (page.metadata?.title) text += `Title: ${page.metadata.title}\n`;
    text += page.text.substring(0, 2000) + '\n\n';
  }
  return text;
}
