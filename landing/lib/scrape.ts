import { checkWebsiteUrl } from "./ssrf";

const PER_PAGE_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_HTML_BYTES = 3 * 1024 * 1024; // 3 MB per page
const MAX_PAGE_CHARS = 20_000;
const MAX_TOTAL_CHARS = 200_000; // combined site_content cap
const CRAWL_BUDGET_MS = 45_000; // total wall-clock budget across the whole crawl
const MAX_CONCURRENT = 5;

const SKIP_EXT_RE =
  /\.(png|jpe?g|gif|svg|webp|ico|bmp|tiff?|pdf|zip|rar|7z|tar|gz|mp3|mp4|mov|avi|wmv|webm|css|js|mjs|map|woff2?|ttf|otf|eot|xml|rss|atom)(\?|#|$)/i;

export type ScrapeResult =
  | { ok: true; site_content: string; pages_scraped: number }
  | { ok: false; reason: string };

export async function scrapeWebsite(startUrl: string): Promise<ScrapeResult> {
  const startOrigin = safeOrigin(startUrl);
  if (!startOrigin) return { ok: false, reason: "invalid-start-url" };

  const started = Date.now();
  const visited = new Set<string>();
  const frontier: string[] = [normalizeUrl(startUrl)];
  const pages: { url: string; content: string }[] = [];
  let totalChars = 0;

  const budgetExceeded = () =>
    Date.now() - started >= CRAWL_BUDGET_MS || totalChars >= MAX_TOTAL_CHARS;

  async function worker() {
    while (!budgetExceeded()) {
      const url = frontier.shift();
      if (!url) return;
      if (visited.has(url)) continue;
      visited.add(url);

      const fetched = await fetchPage(url);
      if (!fetched.ok) continue;

      const pageText = extract(fetched.html).slice(0, MAX_PAGE_CHARS);
      if (pageText) {
        const remaining = MAX_TOTAL_CHARS - totalChars;
        if (remaining <= 0) return;
        const capped = pageText.slice(0, remaining);
        pages.push({ url: fetched.finalUrl, content: capped });
        totalChars += capped.length;
      }

      for (const link of extractLinks(fetched.html, fetched.finalUrl)) {
        if (visited.has(link)) continue;
        if (safeOrigin(link) !== startOrigin) continue;
        frontier.push(link);
      }
    }
  }

  await Promise.all(
    Array.from({ length: MAX_CONCURRENT }, () => worker()),
  );

  if (pages.length === 0) return { ok: false, reason: "no-pages-scraped" };

  const site_content = pages
    .map((p) => `--- PAGE: ${p.url} ---\n${p.content}`)
    .join("\n\n");

  return { ok: true, site_content, pages_scraped: pages.length };
}

type FetchedPage = { ok: true; html: string; finalUrl: string } | { ok: false };

async function fetchPage(startUrl: string): Promise<FetchedPage> {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; FinalClickBot/1.0; +https://finalclick.online)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(PER_PAGE_TIMEOUT_MS),
      });
    } catch {
      return { ok: false };
    }

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: false };
      const next = new URL(loc, currentUrl).toString();
      // Re-SSRF-check on every redirect so we never chase into a private IP.
      const check = await checkWebsiteUrl(next);
      if (!check.ok) return { ok: false };
      currentUrl = check.finalUrl;
      continue;
    }

    if (!res.ok) return { ok: false };

    const ct = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(ct)) return { ok: false };

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) return { ok: false };
    const html = new TextDecoder("utf-8", { fatal: false }).decode(buf);

    return { ok: true, html, finalUrl: currentUrl };
  }

  return { ok: false };
}

function extractLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    if (!href) continue;
    if (href.startsWith("#")) continue;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
    if (SKIP_EXT_RE.test(href)) continue;
    try {
      const abs = new URL(href, baseUrl);
      abs.hash = "";
      out.push(abs.toString());
    } catch {
      // ignore invalid URL
    }
  }
  return out;
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

function extract(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1]).trim() : "";

  const description =
    pickMeta(html, "name", "description") ||
    pickMeta(html, "property", "og:description") ||
    "";

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");

  const text = decode(bodyText).replace(/\s+/g, " ").trim();

  return [
    title && `TITLE: ${title}`,
    description && `DESCRIPTION: ${description}`,
    text && `CONTENT: ${text}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function pickMeta(html: string, attr: string, value: string): string {
  const re1 = new RegExp(
    `<meta[^>]*${attr}=["']${value}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${value}["']`,
    "i",
  );
  const m = html.match(re1) || html.match(re2);
  return m ? decode(m[1]).trim() : "";
}
