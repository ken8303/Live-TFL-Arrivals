import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("catalog loader reuses persistent Cloudflare cache", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const cachedData = {
    updatedAt: "2026-06-20T08:00:00.000Z",
    items: [{ id: "cached-stop", commonName: "Cached stop" }],
  };
  let fetchCalled = false;

  globalThis.caches = {
    default: {
      match: async () => Response.json(cachedData),
      put: async () => {
        throw new Error("put should not run on a cache hit");
      },
    },
  };
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("TfL should not be called on a cache hit");
  };

  try {
    const module = await import(`../functions/api/catalog/shared.mjs?cache-hit=${Date.now()}`);
    const result = await module.getCachedBusStops({});
    assert.deepEqual(result, cachedData);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = originalCaches;
    }
  }
});

test("catalog loader stores fresh data for one day", async () => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  let storedResponse = null;

  globalThis.caches = {
    default: {
      match: async () => undefined,
      put: async (_request, response) => {
        storedResponse = response;
      },
    },
  };
  globalThis.fetch = async () =>
    Response.json({
      stopPoints: [
        {
          id: "490-test",
          naptanId: "490-test",
          commonName: "Test stop",
          lat: 51.5,
          lon: -0.1,
        },
      ],
    });

  try {
    const module = await import(`../functions/api/catalog/shared.mjs?cache-miss=${Date.now()}`);
    const result = await module.getCachedBusStops({});
    assert.equal(result.items.length, 1);
    assert.equal(storedResponse.headers.get("Cache-Control"), "public, max-age=86400");
    assert.equal((await storedResponse.json()).items[0].id, "490-test");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = originalCaches;
    }
  }
});

test("production headers allow required services and block embedding", async () => {
  const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(headers, /X-Frame-Options: DENY/);
  assert.match(headers, /connect-src 'self' https:\/\/api\.postcodes\.io/);
  assert.match(headers, /frame-src https:\/\/www\.google\.com https:\/\/maps\.google\.com/);
  assert.match(headers, /object-src 'none'/);
  assert.doesNotMatch(headers, /unsafe-inline|unsafe-eval/);
});

test("Reading catalog debug query no longer exposes diagnostic payloads", async () => {
  const originalCaches = globalThis.caches;
  globalThis.caches = {
    default: {
      match: async () =>
        Response.json({
          updatedAt: "2026-06-20T08:00:00.000Z",
          items: [{ id: "reading-stop", commonName: "Reading stop" }],
        }),
      put: async () => {},
    },
  };

  try {
    const { onRequestGet } = await import(`../functions/api/catalog/bus-stops.js?debug-disabled=${Date.now()}`);
    const response = await onRequestGet({
      env: {},
      request: new Request("https://example.test/api/catalog/bus-stops?provider=reading-buses&debug=1"),
    });
    const data = await response.json();

    assert.equal(data.items[0].id, "reading-stop");
    assert.equal("sampleNormalised" in data, false);
    assert.equal("sampleKeys" in data, false);
    assert.equal("rawCount" in data, false);
  } finally {
    if (originalCaches === undefined) {
      delete globalThis.caches;
    } else {
      globalThis.caches = originalCaches;
    }
  }
});
