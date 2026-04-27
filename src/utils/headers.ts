const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Looks like a build hash; real Pinterest sends one. "unknown" trips bot detection.
const APP_VERSION = "5e57ed8";

export function buildPinterestHeaders(query: string): Record<string, string> {
  const ua = process.env.USER_AGENT || DEFAULT_UA;
  const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`;
  const referer = `https://www.pinterest.com${sourceUrl}`;
  return {
    "User-Agent": ua,
    "X-Requested-With": "XMLHttpRequest",
    Accept: "application/json, text/javascript, */*, q=0.01",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: referer,
    Origin: "https://www.pinterest.com",
    "X-APP-VERSION": APP_VERSION,
    "X-Pinterest-AppState": "active",
    "X-Pinterest-PWS-Handler": "www/search/[scope].js",
    "X-Pinterest-Source-Url": sourceUrl,
    "sec-ch-ua":
      '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}
