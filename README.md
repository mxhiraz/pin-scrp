# pin-scrp

Pinterest image search behind your own API key. One endpoint, JSON out.

```bash
curl "http://localhost:7777/search?q=fashion+editorial&count=5" \
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

Sizes bigger than `236x` come back too, up to the original file, so it is usable
for moodboards, wallpapers, dataset building, or anything that needs the real
image rather than a thumbnail.

## Not affiliated with Pinterest

This calls the same public search endpoint pinterest.com itself uses. It can stop
working any time Pinterest changes that endpoint.

Read [their terms](https://policy.pinterest.com/en/terms-of-service) before you
put it anywhere public, keep the request volume sane, and don't pass other
people's images off as your own. For commercial work use the
[official API](https://developers.pinterest.com/).

## Running it

With Docker it is four lines, API and Redis together:

```bash
git clone https://github.com/mxhiraz/pin-scrp.git
cd pin-scrp
cp .env.example .env && sed -i '' "s/^API_KEY=.*/API_KEY=$(openssl rand -hex 32)/" .env
docker compose up -d
```

That gives you the API on 7777 with Redis behind it as the cache. Compose reads
`.env` and won't start without an `API_KEY`, so the `sed` line matters. On Linux
drop the `''` after `-i`.

```bash
curl localhost:7777/health
# {"status":"ok","uptime":5}

curl "localhost:7777/search?q=cats&count=3" -H "x-api-key: $(grep ^API_KEY= .env | cut -d= -f2)"
```

`docker compose logs -f api` to watch it, `docker compose down` to stop, add `-v`
to that if you also want Redis to forget what it cached.

### Without Docker

Needs Node 22.7+. Redis is optional and only matters if you run more than one
copy.

```bash
npm install
cp .env.example .env    # put a random string in API_KEY
npm run dev             # watch mode, reads .env
```

For a real deployment, `npm run build && npm start`. If you want the container
but not Redis, `docker build -t pin-scrp .` then
`docker run -p 7777:7777 --env-file .env pin-scrp`.

## Settings

All of it is environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `7777` | |
| `API_KEY` | required | Callers send it as the `x-api-key` header. Without it every search returns 500. |
| `REDIS_URL` | empty | e.g. `redis://localhost:6379`. Empty keeps the cache in memory. Falls back to memory if Redis is unreachable. |
| `CACHE_TTL_SECONDS` | `300` | `0` turns caching off. |
| `RATE_LIMIT_RPM` | `60` | Per client IP. |
| `USER_AGENT` | Chrome 120 on Windows | What gets sent to Pinterest. |

## Endpoints

`GET /health` needs no key and returns `{ "status": "ok", "uptime": 5 }`, uptime
in seconds.

`GET /search` needs the `x-api-key` header and takes:

- `q` is required. Control characters are stripped, then it is trimmed and cut to
  200 characters.
- `count` defaults to 25, clamped to 1..50.
- `bookmark` is the cursor from an earlier response. Leave it off for page one.
- `fresh=1` skips the cache.
- `skip_pages=N` walks N Pinterest pages before returning, 0..20. Each page is
  one more request to Pinterest, so it is slower.

Responses carry `X-Cache` (`HIT`, `MISS`, or `BYPASS` when `fresh` or
`skip_pages` was used) and `X-Request-ID`, which is echoed back if you send one
and shows up in the logs either way. A 429 also carries `Retry-After` in seconds.

In the body, `count` is how many pins came back, not what you asked for.
`bookmark` is the next cursor and turns `null` at the end of the results. A pin
only carries the image sizes Pinterest actually has, so check before reading
`orig`. `link`, `board` and `creator` are `null` when the pin has none, and
`saves` is 0 when Pinterest doesn't report it.

### Paging

Feed the `bookmark` back in until it comes back `null`:

```bash
curl "localhost:7777/search?q=cats&count=25" -H "x-api-key: $API_KEY"
# "bookmark": "Y2JVSG81..."

curl "localhost:7777/search?q=cats&count=25&bookmark=Y2JVSG81..." \
  -H "x-api-key: $API_KEY"
```

If you don't want to keep cursors around, `skip_pages=3` gets you the fourth page
in one call, at the cost of three extra requests to Pinterest.

### When it fails

Errors are always `{ "error": "...", "code": <status> }`:

- 400: `q` missing, or empty once sanitized
- 401: bad or missing `x-api-key`
- 404: unknown path
- 429: rate limited, see `Retry-After`
- 500: the server has no `API_KEY` set, or something unexpected broke
- 502: Pinterest failed or sent back something unreadable

## Caching and rate limits

A result is cached per query, count and bookmark for `CACHE_TTL_SECONDS`.
Requests with `fresh=1` or `skip_pages` are neither read from nor written to the
cache. Without `REDIS_URL` each process keeps its own cache.

Rate limiting is a token bucket per IP, refilling at `RATE_LIMIT_RPM` a minute.
The IP is taken from `X-Forwarded-For`, then `X-Real-IP`, then the socket, so
behind a proxy that sets neither everyone counts as one client.

## Postman

There is a collection and a local environment in `postman/`. Import both, pick
the "Pinterest API - local" environment, set `apiKey` to what is in your `.env`,
and run "Search - basic" first since it saves the `bookmark` the paging request
needs.

## Working on it

```bash
npm run dev     # watch mode
npm test        # self-checks, no network
npm run lint    # typecheck
npm run build   # compile to dist/
```

The first search loads pinterest.com once to pick up cookies and a `csrftoken`,
and keeps that for 30 minutes. Searches then hit Pinterest's
`BaseSearchResource` endpoint with those credentials. A 401 or 403 throws the
session away and retries once. Whatever comes back is cut down to the fields
above, and pins without an id are dropped.

If you deploy it: set a real `API_KEY`, terminate TLS and set `X-Forwarded-For`
at your proxy, and point `REDIS_URL` at a shared Redis if there is more than one
instance. The image runs as a non-root user and has a healthcheck on `/health`.

Patches welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed.
