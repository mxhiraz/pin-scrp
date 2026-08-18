# pin-scrp

A small self-hosted REST API that searches Pinterest and returns clean JSON: pin
id, title, description, every image size, dominant color, board, and creator.

```bash
curl "http://localhost:9000/search?q=fashion+editorial&count=5" \
  -H "x-api-key: your-key"
```

```json
{
  "query": "fashion editorial",
  "count": 5,
  "bookmark": "Y2JVSG81V2sxcmNHRlpWM1J5VFVad1YxcEhSbE5X...",
  "pins": [
    {
      "id": "36239971996748877",
      "title": "Minimal Tie Accessories That Make Tailoring Feel Editorial",
      "description": "Minimal tie accessories bring a cinematic editorial mood...",
      "link": null,
      "pinterest_url": "https://www.pinterest.com/pin/36239971996748877",
      "images": {
        "170x": { "url": "https://i.pinimg.com/236x/47/e2/a0/47e2a0.jpg", "width": 236, "height": 354 },
        "236x": { "url": "https://i.pinimg.com/236x/47/e2/a0/47e2a0.jpg", "width": 236, "height": 354 },
        "474x": { "url": "https://i.pinimg.com/474x/47/e2/a0/47e2a0.jpg", "width": 474, "height": 711 },
        "736x": { "url": "https://i.pinimg.com/736x/47/e2/a0/47e2a0.jpg", "width": 736, "height": 1104 },
        "orig": { "url": "https://i.pinimg.com/originals/47/e2/a0/47e2a0.webp", "width": 1024, "height": 1536 }
      },
      "dominant_color": "#ccc1b2",
      "saves": 0,
      "created_at": "Thu, 09 Jul 2026 14:43:57 +0000",
      "board": { "id": "36240040690912166", "name": "Editorial" },
      "creator": {
        "username": "kanyarat5554",
        "display_name": "Kanyarat",
        "avatar_url": "https://s.pinimg.com/images/user/default_75.png"
      }
    }
  ]
}
```

## Disclaimer

This project is **not affiliated with, endorsed by, or connected to Pinterest**.
It reads Pinterest's public web search endpoint — the same one the website itself
calls — so it can break at any time if Pinterest changes it.

You are responsible for how you run it. Check [Pinterest's Terms of
Service](https://policy.pinterest.com/en/terms-of-service) and your local law
before deploying, keep request volume modest, and don't republish other people's
images as your own. For anything commercial, use the [official Pinterest
API](https://developers.pinterest.com/) instead.

## Features

- One endpoint, one job: `GET /search?q=...` → normalized JSON pins.
- Cursor pagination via the `bookmark` field.
- Response caching — in-memory by default, Redis when `REDIS_URL` is set.
- Per-IP token-bucket rate limiting with a `Retry-After` header.
- API-key auth on every search request.
- Automatic Pinterest session warm-up and CSRF handling, refreshed on 401/403.
- Request IDs on every response, health endpoint, Docker and Compose setup.
- No runtime dependencies beyond [Hono](https://hono.dev); Redis is optional.

## Requirements

- Node.js 18 or newer (uses the built-in `fetch`), or Docker.
- Redis is optional — only needed if you want the cache shared across instances.

## Quick start

```bash
git clone https://github.com/mxhiraz/pin-scrp.git
cd pin-scrp
npm install
cp .env.example .env
```

Open `.env` and set `API_KEY` to a long random string, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then run it:

```bash
npm run dev     # watch mode on http://localhost:9000
```

Check it is alive:

```bash
curl localhost:9000/health
# {"status":"ok","uptime":5}
```

For production:

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t pin-scrp .
docker run -p 9000:9000 --env-file .env pin-scrp
```

### Docker Compose (with Redis)

`docker-compose.yml` starts the API plus a Redis cache. It reads `.env` and
refuses to start if `API_KEY` is unset.

```bash
docker compose up -d
docker compose logs -f api
```

## Configuration

Every setting is an environment variable. Copy `.env.example` to `.env` and edit.

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `9000` | Port the HTTP server listens on. |
| `API_KEY` | *(required)* | Callers must send it as the `x-api-key` header. With no value set, every search returns `500`. |
| `REDIS_URL` | *(empty)* | E.g. `redis://localhost:6379`. Empty means the in-memory cache. Falls back to memory if Redis fails to connect. |
| `CACHE_TTL_SECONDS` | `300` | How long a search result is cached. `0` disables caching. |
| `RATE_LIMIT_RPM` | `60` | Requests per minute per client IP. |
| `USER_AGENT` | Chrome 120 on Windows | User-Agent sent to Pinterest. |

## API reference

### `GET /health`

No auth. Returns `200` with uptime in seconds.

```json
{ "status": "ok", "uptime": 5 }
```

### `GET /search`

Requires the `x-api-key` header.

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string | *(required)* | Search text. Control characters are stripped, then it is trimmed and cut to 200 characters. |
| `count` | int | `25` | Pins per page. Clamped to `1..50`. |
| `bookmark` | string | – | Cursor from a previous response. Omit for the first page. |
| `fresh` | `1`/`true`/`yes` | off | Skip the cache read and fetch from Pinterest. |
| `skip_pages` | int | `0` | Walk N upstream pages before returning, so you get deeper results. Clamped to `0..20`. Costs one upstream request per page. |

Response headers:

| Header | Meaning |
| --- | --- |
| `X-Cache` | `HIT` served from cache, `MISS` fetched and cached, `BYPASS` not cacheable (`fresh` or `skip_pages` used). |
| `X-Request-ID` | Echoed from your request if you send one, otherwise generated. Appears in server logs. |
| `Retry-After` | Seconds to wait, sent only with `429`. |

#### Response fields

| Field | Notes |
| --- | --- |
| `query` | The sanitized query that was actually used. |
| `count` | Number of pins in this response, not the requested count. |
| `bookmark` | Cursor for the next page, or `null` when Pinterest reports the end. |
| `pins[].images` | Present sizes out of `170x`, `236x`, `474x`, `736x`, `orig`. Missing sizes are omitted; `orig` is the largest. |
| `pins[].link` | The external page the pin points to, or `null`. |
| `pins[].saves` | Save count, `0` when Pinterest does not report one. |
| `pins[].board` / `pins[].creator` | `null` when the pin has none. |

#### Pagination

Send the `bookmark` from one response as the `bookmark` param of the next.

```bash
curl "localhost:9000/search?q=cats&count=25" -H "x-api-key: $API_KEY"
# → "bookmark": "Y2JVSG81..."

curl "localhost:9000/search?q=cats&count=25&bookmark=Y2JVSG81..." \
  -H "x-api-key: $API_KEY"
```

Keep going until `bookmark` comes back `null`.

`skip_pages` is the stateless alternative: `skip_pages=3` walks three pages
server-side and returns the fourth. Handy for getting varied pins without
tracking cursors, but it makes three extra upstream requests.

### Errors

Every error is JSON in the shape `{ "error": "...", "code": <status> }`.

| Status | When |
| --- | --- |
| `400` | `q` is missing, or nothing is left after sanitizing it. |
| `401` | `x-api-key` is missing or wrong. |
| `404` | Unknown path. |
| `429` | Rate limit exceeded. See `Retry-After`. |
| `500` | `API_KEY` is not configured on the server, or an unexpected error. |
| `502` | Pinterest failed, timed out, or returned something unparseable. |

## Caching

Results are cached per `query + count + bookmark` for `CACHE_TTL_SECONDS`.
Requests using `fresh=1` or `skip_pages` are never read from or written to the
cache. Without `REDIS_URL` the cache is in-process, so each instance keeps its
own; set `REDIS_URL` to share one across instances.

## Rate limiting

A token bucket per client IP, refilling at `RATE_LIMIT_RPM` per minute. The IP
comes from `X-Forwarded-For`, then `X-Real-IP`, then the socket address — so put
the service behind a proxy that sets those headers, or all traffic looks like one
client.

## Postman

`postman/` holds a collection and a local environment.

1. Import both files into Postman.
2. Select the **Pinterest API - local** environment.
3. Set `apiKey` to the value from your `.env` (and `baseUrl` if you changed the port).
4. Run **Search - basic** first — it saves the `bookmark` variable that the
   pagination request uses.

## Project layout

```
src/
  index.ts              server setup, routing, health, error handling
  routes/search.ts      /search: validation, caching, pagination
  services/pinterest.ts upstream request and response normalization
  services/session.ts   cookie + CSRF session, cached and auto-refreshed
  middleware/auth.ts    x-api-key check
  middleware/cache.ts   memory and Redis cache stores
  middleware/rateLimit.ts per-IP token bucket
  utils/headers.ts      browser-like headers for Pinterest
  types/pinterest.ts    response types
  api.test.ts           self-checks for the pure helpers
```

## Development

```bash
npm run dev     # watch mode
npm test        # unit self-checks, no network needed
npm run lint    # typecheck only
npm run build   # compile to dist/
```

### How it works

1. On the first search the server loads `pinterest.com` once, keeps the cookies
   and the `csrftoken`, and caches that session for 30 minutes.
2. Searches hit Pinterest's `BaseSearchResource` endpoint with browser-like
   headers plus that cookie and CSRF token.
3. A `401` or `403` invalidates the session and retries once.
4. The raw response is mapped down to the fields documented above; pins without
   an id are dropped.

### Running it in production

- Always set a strong `API_KEY`; the service refuses to serve searches without one.
- Terminate TLS and set `X-Forwarded-For` at your reverse proxy.
- Point `REDIS_URL` at a shared Redis if you run more than one instance.
- The Docker image runs as a non-root user and has a `/health` healthcheck.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
