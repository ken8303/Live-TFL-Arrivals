import test from "node:test";
import assert from "node:assert/strict";

import {
  getDueMinuteKeyForTime,
  getScheduleKey,
  parseScheduleKey,
} from "../functions/api/push-schedule-key.mjs";

test("schedule keys preserve timezone and selection data", () => {
  const key = getScheduleKey(
    "endpoint-hash",
    {
      id: "weekday-trip",
      time: "09:00",
      weekdays: [1, 2, 3, 4, 5],
    },
    "Asia/Hong_Kong",
  );

  assert.deepEqual(parseScheduleKey(key), {
    endpointHash: "endpoint-hash",
    scheduleId: "weekday-trip",
    time: "09:00",
    weekdayMask: 62,
    timeZone: "Asia/Hong_Kong",
  });
});

test("legacy keys continue to use London time", () => {
  assert.deepEqual(parseScheduleKey("schedule:endpoint:legacy:0900:62"), {
    endpointHash: "endpoint",
    scheduleId: "legacy",
    time: "09:00",
    weekdayMask: 62,
    timeZone: "Europe/London",
  });
});

test("due checks use the saved timezone", () => {
  const saturdayMask = 1 << 6;
  const now = new Date("2026-06-20T08:05:00.000Z");

  assert.equal(
    getDueMinuteKeyForTime("09:00", saturdayMask, "Europe/London", now),
    "2026-06-20T09:00",
  );
  assert.equal(
    getDueMinuteKeyForTime("04:00", saturdayMask, "America/New_York", now),
    "2026-06-20T04:00",
  );
  assert.equal(getDueMinuteKeyForTime("09:00", saturdayMask, "America/New_York", now), "");
});

test("catch-up window handles a schedule just before midnight", () => {
  const saturdayMask = 1 << 6;
  const now = new Date("2026-06-21T00:03:00.000Z");

  assert.equal(
    getDueMinuteKeyForTime("23:55", saturdayMask, "UTC", now),
    "2026-06-20T23:55",
  );
});
