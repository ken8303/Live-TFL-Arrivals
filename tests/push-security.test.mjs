import test from "node:test";
import assert from "node:assert/strict";

import {
  hasSavedPushEndpoint,
  isSameOriginPost,
  savePushSchedule,
  sendPushTest,
} from "../functions/api/push.js";

class MemoryKv {
  constructor() {
    this.store = new Map();
  }

  async get(key, type) {
    const value = this.store.get(key);
    if (value === undefined) return null;
    return type === "json" ? JSON.parse(value) : value;
  }

  async put(key, value) {
    this.store.set(key, value);
  }

  async delete(key) {
    this.store.delete(key);
  }
}

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: {
    p256dh: "A".repeat(88),
    auth: "B".repeat(24),
  },
};

const schedule = {
  id: "morning-bus",
  type: "bus",
  title: "Morning bus",
  time: "08:00",
  weekdays: [1, 2, 3, 4, 5],
  stopId: "490000001",
};

const clientToken = "C".repeat(40);

function makeRequest(body, headers = {}) {
  return new Request("https://tfl.example.com/api/push/schedules", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Host: "tfl.example.com",
      Origin: "https://tfl.example.com",
      "CF-Connecting-IP": "203.0.113.10",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("same-origin write guard requires an honest browser Origin and matching Host", () => {
  assert.equal(isSameOriginPost(makeRequest({})), true);
  assert.equal(isSameOriginPost(makeRequest({}, { Origin: "https://evil.example" })), false);
  assert.equal(isSameOriginPost(makeRequest({}, { Origin: "" })), false);
});

test("push schedule writes without same-origin headers are rejected before storage changes", async () => {
  const kv = new MemoryKv();
  const response = await savePushSchedule({
    request: makeRequest({ subscription, schedule, clientToken }, { Origin: "" }),
    env: { PUSH_SCHEDULES: kv },
  });

  assert.equal(response.status, 403);
  assert.equal(kv.store.size, 0);
});

test("push write endpoints throttle repeated requests from one client address", async () => {
  const kv = new MemoryKv();
  const env = { PUSH_SCHEDULES: kv };

  for (let index = 0; index < 30; index += 1) {
    const response = await savePushSchedule({
      request: makeRequest({ subscription, schedule, clientToken }),
      env,
    });
    assert.equal(response.status, 200);
  }

  const throttled = await savePushSchedule({
    request: makeRequest({ subscription, schedule, clientToken }),
    env,
  });
  assert.equal(throttled.status, 429);
});

test("saved push endpoints are recognized for the matching device token", async () => {
  const env = { PUSH_SCHEDULES: new MemoryKv() };
  const response = await savePushSchedule({
    request: makeRequest({ subscription, schedule, clientToken }, { "CF-Connecting-IP": "203.0.113.30" }),
    env,
  });

  assert.equal(response.status, 200);
  assert.equal(await hasSavedPushEndpoint(env, subscription, clientToken), true);
  assert.equal(await hasSavedPushEndpoint(env, subscription, "D".repeat(40)), false);
});

test("test push rejects an endpoint that was not saved by this device", async () => {
  const response = await sendPushTest({
    request: makeRequest({ subscription, clientToken }, { "CF-Connecting-IP": "203.0.113.20" }),
    env: { PUSH_SCHEDULES: new MemoryKv() },
  });

  assert.equal(response.status, 403);
});
