import test from "node:test";
import assert from "node:assert/strict";
import server from "../server.cjs";
import worker from "../worker.js";
import { onRequestGet as getTfl } from "../functions/api/tfl.js";

function localRequest(url) {
  return new Promise((resolve) => {
    server.emit("request", { url, headers: { host: "localhost" } }, {
      writeHead(status, headers) { this.status = status; this.headers = headers; },
      end(body) { resolve({ status: this.status, headers: this.headers, body: String(body) }); },
    });
  });
}

test("local server serves the public asset directory", async () => {
  const page = await localRequest("/");
  assert.equal(page.status, 200);
  assert.match(page.body, /Nearest Transit Times/);
  assert.equal((await localRequest("/server.cjs")).status, 404);
});

test("TfL proxy strips upstream headers and distinguishes invalid paths from failures", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]", { headers: { "Content-Type": "application/json", "Set-Cookie": "secret=1" } });
  try {
    const success = await getTfl({ request: new Request("https://example.test/api/tfl/StopPoint/123/Arrivals"), env: {} });
    assert.equal(success.status, 200);
    assert.equal(success.headers.get("set-cookie"), null);
    assert.equal(success.headers.get("content-type"), "application/json");
    assert.equal((await getTfl({ request: new Request("https://example.test/api/tfl/not-allowed"), env: {} })).status, 400);
    globalThis.fetch = async () => { throw new Error("offline"); };
    assert.equal((await getTfl({ request: new Request("https://example.test/api/tfl/StopPoint/123/Arrivals"), env: {} })).status, 502);
  } finally { globalThis.fetch = originalFetch; }
});

test("Worker rate limits public APIs before upstream calls", async () => {
  const env = { API_RATE_LIMITER: { limit: async () => ({ success: false }) },
    ASSETS: { fetch: async () => new Response("asset") } };
  for (const path of ["/api/tfl/StopPoint/123/Arrivals", "/api/national-rail/arrivals", "/api/reading-buses/lines", "/api/catalog/bus-stops"]) {
    const response = await worker.fetch(new Request(`https://example.test${path}`), env);
    assert.equal(response.status, 429);
  }
  assert.equal((await worker.fetch(new Request("https://example.test/"), env)).status, 200);
});
