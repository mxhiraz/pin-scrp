import { Hono } from "hono";
import { searchPinterest } from "../services/pinterest.js";
import { PinterestUpstreamError } from "../types/pinterest.js";
import { cacheKey, getCache } from "../middleware/cache.js";

const MAX_QUERY_LEN = 200;
const MAX_COUNT = 50;
const MIN_COUNT = 1;

export function sanitizeQuery(raw: string): string {
  // strip control chars
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, "").trim();
  return cleaned.slice(0, MAX_QUERY_LEN);
}

export function clampCount(raw: string | undefined): number {
  if (!raw) return 25;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return 25;
  return Math.min(MAX_COUNT, Math.max(MIN_COUNT, n));
}

function hashQuery(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export const searchRouter = new Hono<{ Variables: { requestId: string } }>();

function isTrue(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

searchRouter.get("/", async (c) => {
  const reqId = c.get("requestId");
  const rawQ = c.req.query("q");
  if (!rawQ) {
    return c.json({ error: "Missing required query param: q", code: 400 }, 400);
  }
  const query = sanitizeQuery(rawQ);
  if (!query) {
    return c.json({ error: "Empty query after sanitization", code: 400 }, 400);
  }
  const count = clampCount(c.req.query("count"));
  const bookmark = c.req.query("bookmark") || undefined;
  const fresh = isTrue(c.req.query("fresh"));
  const skipPagesRaw = c.req.query("skip_pages");
  const skipPagesReq = skipPagesRaw ? parseInt(skipPagesRaw, 10) : 0;
  const skipPages = Math.max(
    0,
    Math.min(20, Number.isFinite(skipPagesReq) ? skipPagesReq : 0),
  );

  const ttl = Math.max(0, parseInt(process.env.CACHE_TTL_SECONDS ?? "300", 10));
  const cache = await getCache();
  const key = cacheKey(query, count, bookmark);

  if (ttl > 0 && !fresh && !skipPages) {
    const cached = await cache.get(key);
    if (cached) {
      c.header("X-Cache", "HIT");
      return c.json(cached);
    }
  }

  try {
    let cur = bookmark;
    let result = await searchPinterest({ query, count, bookmark: cur });
    for (let i = 0; i < skipPages && result.bookmark; i++) {
      cur = result.bookmark;
      result = await searchPinterest({ query, count, bookmark: cur });
    }

    const cacheable = ttl > 0 && !fresh && !skipPages;
    if (cacheable) await cache.set(key, result, ttl);
    c.header("X-Cache", cacheable ? "MISS" : "BYPASS");
    return c.json(result);
  } catch (err) {
    const qHash = hashQuery(query);
    if (err instanceof PinterestUpstreamError) {
      console.error(
        `[${new Date().toISOString()}] [${reqId ?? "-"}] upstream error qHash=${qHash} qLen=${query.length}: ${err.message}`,
      );
      return c.json(
        { error: "Upstream Pinterest request failed", code: 502 },
        502,
      );
    }
    console.error(
      `[${new Date().toISOString()}] [${reqId ?? "-"}] unexpected error qHash=${qHash} qLen=${query.length}: ${(err as Error).message}`,
    );
    return c.json({ error: "Internal server error", code: 500 }, 500);
  }
});
