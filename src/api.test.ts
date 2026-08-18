import assert from "node:assert/strict";
import test from "node:test";
import { cacheKey } from "./middleware/cache.js";
import { clampCount, sanitizeQuery } from "./routes/search.js";
import { mapPin } from "./services/pinterest.js";

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
    pinner: { username: "someone", full_name: "Some One" },
  });
  assert.equal(pin.title, "Grid title");
  assert.equal(pin.saves, 42);
  assert.deepEqual(pin.board, { id: "b1", name: "Moodboard" });
  assert.equal(pin.creator?.avatar_url, null);
  assert.equal(pin.images["236x"]?.width, 236);
});
