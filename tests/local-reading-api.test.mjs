import test from "node:test";
import assert from "node:assert/strict";
import server from "../server.cjs";

function request(url) {
  return new Promise((resolve) => {
    let status, headers;
    server.emit("request", { url, headers: { host: "localhost" } }, {
      writeHead(code, values) { status = code; headers = values; },
      end(body) { resolve({ status, headers, body: JSON.parse(body) }); },
    });
  });
}

test("local Reading routes call the provider and return normalized results", async () => {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.READING_OPEN_DATA_API_TOKEN;
  process.env.READING_OPEN_DATA_API_TOKEN = "test-token";
  const urls = [];
  globalThis.fetch = async (value) => {
    const url = new URL(value);
    urls.push(url);
    if (url.pathname.endsWith("/lines")) return Response.json([{ name: "17" }]);
    const departure = new Date(Date.now() + 600_000).toISOString();
    return new Response(`<MonitoredStopVisit><PublishedLineName>17</PublishedLineName><DestinationName>Reading</DestinationName><ExpectedDepartureTime>${departure}</ExpectedDepartureTime></MonitoredStopVisit>`);
  };
  try {
    const predictions = await request("/api/reading-buses/predictions?location=stop-123");
    assert.equal(predictions.status, 200);
    assert.equal(predictions.body.arrivals[0].lineName, "17");
    assert.equal(predictions.body.arrivals[0].destinationName, "Reading");
    assert.equal(urls[0].searchParams.get("location"), "stop-123");
    assert.equal(urls[0].searchParams.get("api_token"), "test-token");
    const lines = await request("/api/reading-buses/lines");
    assert.equal(lines.status, 200);
    assert.equal(lines.body.lines[0].name, "17");
    assert.equal((await request("/api/reading-buses/predictions")).status, 400);
    assert.equal(urls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.READING_OPEN_DATA_API_TOKEN;
    else process.env.READING_OPEN_DATA_API_TOKEN = originalToken;
  }
});
