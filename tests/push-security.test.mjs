import test from "node:test";
import assert from "node:assert/strict";

import {
  deletePushSchedule,
  runScheduledPush,
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

  async list({ prefix = "" }) {
    return { keys: [...this.store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
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


test("concurrent schedule saves remain independently editable and deletable", async () => {
  const kv = new MemoryKv();
  const env = { PUSH_SCHEDULES: kv };
  const save = (id, time = "08:00") => savePushSchedule({ env, request: makeRequest({
    subscription, clientToken, timeZone: "Europe/London", schedule: { ...schedule, id, time },
  }) });
  const responses = await Promise.all([save("first"), save("second")]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal([...kv.store.keys()].filter((key) => key.startsWith("schedule-index:")).length, 2);
  assert.equal((await save("first", "09:00")).status, 200);
  assert.equal([...kv.store.keys()].filter((key) => key.startsWith("schedule:") && key.includes(":first:")).length, 1);
  for (const scheduleId of ["first", "second"]) {
    const response = await deletePushSchedule({ env, request: makeRequest({ endpoint: subscription.endpoint, scheduleId, clientToken }) });
    assert.equal(response.status, 200);
  }
  assert.equal([...kv.store.keys()].filter((key) => key.startsWith("schedule:")).length, 0);
});

test("deletion recovers legacy orphan records across paginated listings", async () => {
  const kv = new MemoryKv();
  const env = { PUSH_SCHEDULES: kv };
  await savePushSchedule({ env, request: makeRequest({ subscription, schedule, clientToken }) });
  const key = [...kv.store.keys()].find((key) => key.startsWith("schedule:"));
  const oldKey = key.replace(":0800:", ":0900:");
  kv.store.set(oldKey, kv.store.get(key));
  for (const indexKey of [...kv.store.keys()].filter((key) => key.startsWith("schedule-index:"))) kv.store.delete(indexKey);
  const list = kv.list.bind(kv);
  kv.list = async (options) => {
    const all = await list(options);
    const offset = Number(options.cursor || 0);
    return { keys: all.keys.slice(offset, offset + 1), list_complete: offset + 1 >= all.keys.length, cursor: String(offset + 1) };
  };
  const response = await deletePushSchedule({ env, request: makeRequest({ endpoint: subscription.endpoint, scheduleId: schedule.id, clientToken }) });
  assert.equal(response.status, 200);
  assert.equal(kv.store.has(key), false);
  assert.equal(kv.store.has(oldKey), false);
});

test("deletion tombstone prevents stale schedule records from sending again", async () => {
  const kv = new MemoryKv();
  const now = new Date();
  const time = `${String(now.getUTCHours()).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 5) * 5).padStart(2, "0")}`;
  const env = { PUSH_SCHEDULES: kv, VAPID_PUBLIC_KEY: "test", VAPID_PRIVATE_JWK: "test" };
  await savePushSchedule({ env, request: makeRequest({ subscription, clientToken, timeZone: "UTC", schedule: { ...schedule, time, weekdays: [0,1,2,3,4,5,6] } }) });
  const key = [...kv.store.keys()].find((key) => key.startsWith("schedule:"));
  const stale = kv.store.get(key);
  await deletePushSchedule({ env, request: makeRequest({ endpoint: subscription.endpoint, scheduleId: schedule.id, clientToken }) });
  kv.store.set(key, stale);
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => { fetchCount++; throw new Error("Deleted reminder must not fetch"); };
  try { await runScheduledPush({}, env); } finally { globalThis.fetch = originalFetch; }
  assert.equal(fetchCount, 0);
});

test("another device cannot delete a saved reminder", async () => {
  const kv = new MemoryKv();
  const env = { PUSH_SCHEDULES: kv };
  await savePushSchedule({ env, request: makeRequest({ subscription, schedule, clientToken }) });
  const response = await deletePushSchedule({ env, request: makeRequest({ endpoint: subscription.endpoint, scheduleId: schedule.id, clientToken: "D".repeat(40) }) });
  assert.equal(response.status, 403);
  assert.equal([...kv.store.keys()].filter((key) => key.startsWith("schedule:")).length, 1);
});

test("a failed alert feed does not block later scheduler batches and can retry", async () => {
  const kv = new MemoryKv();
  const env = { PUSH_SCHEDULES: kv, VAPID_PUBLIC_KEY: "test", VAPID_PRIVATE_JWK: "test" };
  const now = new Date();
  const time = `${String(now.getUTCHours()).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 5) * 5).padStart(2, "0")}`;
  for (let i = 0; i < 11; i++) {
    const response = await savePushSchedule({ env, request: makeRequest({ subscription, clientToken, timeZone: "UTC",
      schedule: { ...schedule, id: `batch-${i}`, stopId: `stop-${i}`, time, weekdays: [0,1,2,3,4,5,6], alertOnly: true },
    }) });
    assert.equal(response.status, 200);
  }
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let failing = true;
  const visited = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    visited.push(path);
    if (failing && path.includes("/stop-0/")) throw new Error("Temporary feed failure");
    return Response.json([]);
  };
  console.error = () => {};
  try {
    await runScheduledPush({}, env);
    assert.equal(visited.length, 11);
    const failedKey = [...kv.store.keys()].find((key) => key.startsWith("schedule:") && key.includes(":batch-0:"));
    assert.equal(JSON.parse(kv.store.get(failedKey)).lastFiredKey, "");
    failing = false;
    visited.length = 0;
    await runScheduledPush({}, env);
    assert.equal(visited.length, 1);
    assert.ok(JSON.parse(kv.store.get(failedKey)).lastFiredKey);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});
