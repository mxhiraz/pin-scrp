import type { MiddlewareHandler } from "hono";

export function apiKeyAuth(): MiddlewareHandler {
  return async (c, next) => {
    const expected = process.env.API_KEY;
    if (!expected) {
      return c.json(
        { error: "Server missing API_KEY config", code: 500 },
        500,
      );
    }
    const provided = c.req.header("x-api-key");
    if (!provided || provided !== expected) {
      return c.json({ error: "Unauthorized", code: 401 }, 401);
    }
    await next();
  };
}
