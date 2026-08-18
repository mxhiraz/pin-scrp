# Contributing

Thanks for taking a look. Small, focused pull requests get merged fastest.

## Setup

```bash
npm install
cp .env.example .env   # then set API_KEY to any string for local work
npm run dev
```

## Before you open a pull request

```bash
npm run lint   # typecheck, must be clean
npm test       # self-checks, no network needed
```

If you change behavior, add or update a check in `src/api.test.ts`. Tests must
not call Pinterest — keep them on pure helpers so they run offline and fast.

## Style

- TypeScript, strict mode, ES modules. Import local files with the `.js`
  extension, as the rest of the code does.
- Match the surrounding code. No new dependencies unless a few lines cannot do
  the job; Redis is optional and must stay optional.
- Comment the non-obvious only — why, not what.

## Good things to work on

- Pinterest response fields we drop but people want (video pins, rich metadata).
- Better upstream failure handling: timeouts, retries with backoff.
- Extra endpoints in the same normalized shape, e.g. related pins or boards.

## Reporting bugs

Include the request you sent (redact your `API_KEY`), the status and body you
got back, the `X-Request-ID` from the response, and your Node or Docker version.

If Pinterest changed their endpoint and everything returns `502`, say so in the
issue title — that one affects everybody.

## Scope

This project reads Pinterest's public web endpoint. Pull requests aimed at
evading rate limits or blocks, rotating proxies to hide traffic volume, or
scraping at scale will not be merged.

By contributing, you agree your work is released under the [MIT License](LICENSE).
