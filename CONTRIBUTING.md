# Contributing

```bash
npm install
cp .env.example .env   # any string works as API_KEY locally
npm run dev
```

Before you send a PR, `npm run lint` should be clean and `npm test` should pass.
If you changed how something behaves, put a check in `src/api.test.ts`. Tests
don't call Pinterest, keep them on the pure helpers so they still run offline.

Match the code that is already there: TypeScript, strict, ES modules, local
imports ending in `.js`. Don't pull in a dependency for something a few lines can
do, and leave Redis optional. Comment the why when it isn't obvious, skip the
what.

Things worth doing:

- fields we throw away that people want back, video pins for one
- timeouts and retries when Pinterest is having a bad day
- more endpoints in the same shape, related pins or boards

Bug reports are more useful with the request you sent (minus your key), the
status and body you got, the `X-Request-ID` from the response, and your Node or
Docker version. If searches all return 502, Pinterest probably changed the
endpoint, put that in the title so nobody duplicates it.

What won't get merged: anything aimed at dodging rate limits or blocks, proxy
rotation to hide how much you're pulling, or scraping at scale.

Anything you send is under the [MIT License](LICENSE).
