import type { Context, MiddlewareHandler } from "hono";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

function getClientIp(c: Context): string {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = c.req.header("x-real-ip");
  if (real) return real;
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? "unknown";
}

export function rateLimit(): MiddlewareHandler {
  const rpm = Math.max(1, parseInt(process.env.RATE_LIMIT_RPM ?? "60", 10));
  const capacity = rpm;
  const refillPerMs = rpm / 60_000;

  return async (c, next) => {
    const ip = getClientIp(c);
    const now = Date.now();
    let b = buckets.get(ip);
    if (!b) {
      b = { tokens: capacity, lastRefill: now };
      buckets.set(ip, b);
    } else {
      const elapsed = now - b.lastRefill;
      b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerMs);
      b.lastRefill = now;
    }

    if (b.tokens < 1) {
      const needed = 1 - b.tokens;
      const retryMs = Math.ceil(needed / refillPerMs);
      c.header("Retry-After", Math.ceil(retryMs / 1000).toString());
      return c.json({ error: "Rate limit exceeded", code: 429 }, 429);
    }

    b.tokens -= 1;
    await next();
  };
}
