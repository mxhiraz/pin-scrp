import { buildPinterestHeaders } from "../utils/headers.js";

interface Session {
  cookieHeader: string;
  csrfToken: string;
  fetchedAt: number;
}

let cached: Session | null = null;
let inflight: Promise<Session> | null = null;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min

function parseSetCookies(setCookieHeaders: string[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const raw of setCookieHeaders) {
    const first = raw.split(";")[0];
    if (!first) continue;
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) jar[name] = value;
  }
  return jar;
}

function getSetCookieList(headers: Headers): string[] {
  // Node 18+ Headers supports getSetCookie
  const anyH = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof anyH.getSetCookie === "function") return anyH.getSetCookie();
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function warmSession(): Promise<Session> {
  const ua =
    process.env.USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

  const resp = await fetch("https://www.pinterest.com/", {
    method: "GET",
    headers: {
      "User-Agent": ua,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
  });

  if (!resp.ok && resp.status !== 200) {
    throw new Error(`session warm-up failed: ${resp.status}`);
  }

  const setCookies = getSetCookieList(resp.headers);
  const jar = parseSetCookies(setCookies);
  const csrf = jar["csrftoken"] ?? "";

  if (!csrf) {
    throw new Error("session warm-up: csrftoken cookie not found");
  }

  const cookieHeader = Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  return {
    cookieHeader,
    csrfToken: csrf,
    fetchedAt: Date.now(),
  };
}

export async function getSession(forceRefresh = false): Promise<Session> {
  if (
    !forceRefresh &&
    cached &&
    Date.now() - cached.fetchedAt < SESSION_TTL_MS
  ) {
    return cached;
  }
  if (inflight) return inflight;
  inflight = warmSession()
    .then((s) => {
      cached = s;
      return s;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function buildAuthedHeaders(
  query: string,
  session: Session,
): Record<string, string> {
  return {
    ...buildPinterestHeaders(query),
    Cookie: session.cookieHeader,
    "X-CSRFToken": session.csrfToken,
  };
}

export function invalidateSession() {
  cached = null;
}
