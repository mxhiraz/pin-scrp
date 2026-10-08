import assert from "node:assert/strict";
import test from "node:test";
import { cacheKey } from "./middleware/cache.js";
import { clampCount, sanitizeQuery } from "./routes/search.js";
import { firstPlayable, mapPin, videoCandidate } from "./services/pinterest.js";

test("sanitizeQuery strips control characters and caps length", () => {
  assert.equal(sanitizeQuery("  fashion editorial  "), "fashion editorial");
  assert.equal(sanitizeQuery("a".repeat(500)).length, 200);
  assert.equal(sanitizeQuery("   "), "");
});

test("clampCount keeps counts inside 1..50 and defaults to 25", () => {
  assert.equal(clampCount(undefined), 25);
  assert.equal(clampCount("abc"), 25);
  assert.equal(clampCount("0"), 1);
  assert.equal(clampCount("999"), 50);
  assert.equal(clampCount("10"), 10);
});

test("cacheKey separates pages of the same query", () => {
  assert.notEqual(cacheKey("cats", 25), cacheKey("cats", 50));
  assert.notEqual(cacheKey("cats", 25), cacheKey("cats", 25, undefined, "videos"));
  assert.notEqual(cacheKey("cats", 25), cacheKey("cats", 25, "bm1"));
});

test("mapPin fills defaults for a sparse upstream pin", () => {
  const pin = mapPin({ id: "123" });
  assert.equal(pin.pinterest_url, "https://www.pinterest.com/pin/123");
  assert.equal(pin.title, "");
  assert.equal(pin.saves, 0);
  assert.equal(pin.board, null);
  assert.equal(pin.creator, null);
  assert.deepEqual(pin.images, {});
  assert.deepEqual(pin.labels, []);
  assert.equal(pin.domain, "");
  assert.equal(pin.promoted, false);
  assert.equal(pin.reactions, 0);
});

test("mapPin reads nested board, creator, saves and image sizes", () => {
  const pin = mapPin({
    id: "9",
    grid_title: "Grid title",
    images: {
      "236x": { url: "https://i.pinimg.com/a.jpg", width: 236, height: 350 },
    },
    aggregated_pin_data: { aggregated_stats: { saves: 42 } },
    board: { id: "b1", name: "Moodboard" },
    pinner: { username: "someone", full_name: "Some One", follower_count: 92, is_verified_merchant: true },
    pin_join: { visual_annotation: ["Sunscreen Advertisement", "Spf Skincare"] },
    domain: "instagram.com",
    is_promoted: true,
    reaction_counts: { "1": 330, "7": 2 },
  });
  assert.equal(pin.title, "Grid title");
  assert.equal(pin.saves, 42);
  assert.deepEqual(pin.board, { id: "b1", name: "Moodboard" });
  assert.equal(pin.creator?.avatar_url, null);
  assert.deepEqual(
    { followers: pin.creator?.followers, merchant: pin.creator?.merchant, ads_only: pin.creator?.ads_only },
    { followers: 92, merchant: true, ads_only: false },
  );
  assert.deepEqual(pin.labels, ["Sunscreen Advertisement", "Spf Skincare"]);
  assert.equal(pin.domain, "instagram.com");
  assert.equal(pin.promoted, true);
  assert.equal(pin.reactions, 332);
  assert.equal(pin.images["236x"]?.width, 236);
});

test("videoCandidate lists both 720p mp4 addresses for a stream, prefers a listed mp4, and skips photos", () => {
  const hash = "86d2217d6acf5885a7b748a9c81f90b9";
  const stream = `https://v1.pinimg.com/videos/iht/hls/86/d2/21/${hash}.m3u8`;
  assert.deepEqual(videoCandidate({ V_HLSV4: { url: stream, width: 720, height: 1280, duration: 4901 } }), {
    mp4s: [
      `https://v1.pinimg.com/videos/mc/720p/86/d2/21/${hash}.mp4`,
      `https://v1.pinimg.com/videos/iht/720p/86/d2/21/${hash}.mp4`,
    ],
    width: 720,
    height: 1280,
    seconds: 4.9,
  });
  const listed = "https://v1.pinimg.com/videos/mc/720p/aa/bb/cc/x.mp4";
  assert.deepEqual(videoCandidate({ V_HLSV4: { url: stream }, V_720P: { url: listed } })?.mp4s, [listed]);
  assert.equal(videoCandidate({ V_HLSV4: { url: "https://example.com/other.m3u8" } }), null);
  assert.equal(videoCandidate(undefined), null);
});

test("firstPlayable returns the first address that answers 200, or null", async () => {
  const answers: Record<string, number | Error> = { a: 403, b: new Error("timeout"), c: 200, d: 200 };
  const fake = (async (url: string) => {
    const a = answers[url];
    if (a instanceof Error) throw a;
    return new Response(null, { status: a });
  }) as typeof fetch;
  assert.equal(await firstPlayable(["a", "b", "c", "d"], fake), "c");
  assert.equal(await firstPlayable(["a", "b"], fake), null);
  assert.equal(await firstPlayable([], fake), null);
});
