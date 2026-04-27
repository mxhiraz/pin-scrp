import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import { searchRouter } from "./routes/search.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { apiKeyAuth } from "./middleware/auth.js";

const app = new Hono<{ Variables: { requestId: string } }>();
const startedAt = Date.now();

app.use("*", async (c, next) => {
  const id = c.req.header("x-request-id") || randomUUID();
  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
});

app.get("/health", (c) =>
  c.json({ status: "ok", uptime: Math.floor((Date.now() - startedAt) / 1000) }),
);

app.use("/search/*", apiKeyAuth(), rateLimit());
app.use("/search", apiKeyAuth(), rateLimit());
app.route("/search", searchRouter);

app.onError((err, c) => {
  const reqId = c.get("requestId");
  console.error(
    `[${new Date().toISOString()}] [${reqId}] unhandled: ${err.message}`,
  );
  return c.json({ error: "Internal server error", code: 500 }, 500);
});

app.notFound((c) => c.json({ error: "Not found", code: 404 }, 404));

const port = parseInt(process.env.PORT ?? "9000", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[pinterest-api] listening on :${info.port}`);
});
