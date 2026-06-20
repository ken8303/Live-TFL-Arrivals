import test from "node:test";
import assert from "node:assert/strict";

import { buildTransportAlertResult } from "../functions/api/push.js";

const checkedAt = "2026-06-20T12:00:00.000Z";

test("alert-only notifications include cancellation, delay, and platform changes", () => {
  const result = buildTransportAlertResult(
    [
      {
        id: "cancelled-service",
        lineName: "Great Western Railway",
        destinationName: "Oxford",
        serviceStatus: "cancelled",
        platformName: "Platform 8",
      },
      {
        id: "delayed-service",
        lineName: "CrossCountry",
        destinationName: "Birmingham New Street",
        serviceStatus: "delayed",
        platformName: "Platform 7",
      },
      {
        id: "platform-service",
        lineName: "Elizabeth line",
        destinationName: "Abbey Wood",
        platformName: "Platform 11",
      },
    ],
    { lineName: "National Rail" },
    { platforms: { "platform-service": "Platform 10" } },
    "Elizabeth line: Severe delays",
    checkedAt,
  );

  assert.match(result.body, /Oxford cancelled/);
  assert.match(result.body, /Birmingham New Street delayed/);
  assert.match(result.body, /platform changed from Platform 10 to Platform 11/);
  assert.equal(result.body.includes("Severe delays"), false, "push body remains capped at three alert lines");
  assert.deepEqual(result.alertState, {
    platforms: {
      "cancelled-service": "Platform 8",
      "delayed-service": "Platform 7",
      "platform-service": "Platform 11",
    },
    checkedAt,
  });
});

test("normal services establish a platform baseline without sending an alert", () => {
  const result = buildTransportAlertResult(
    [
      {
        lineId: "central",
        destinationName: "Ealing Broadway",
        expectedArrival: "2026-06-20T12:10:00.000Z",
        platformName: "Platform 1",
      },
    ],
    { lineName: "Central line" },
    {},
    "",
    checkedAt,
  );

  assert.equal(result.body, "");
  assert.deepEqual(result.alertState.platforms, {
    "central|Ealing Broadway|2026-06-20T12:10:00.000Z": "Platform 1",
  });
});

test("services without an identifier do not create a false platform-change key", () => {
  const result = buildTransportAlertResult(
    [{ platformName: "Platform 2" }],
    {},
    { platforms: { "||": "Platform 1" } },
    "",
    checkedAt,
  );

  assert.equal(result.body, "");
  assert.deepEqual(result.alertState.platforms, {});
});
