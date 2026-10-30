import test from "node:test";
import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";

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

const devicePublicKey = createECDH("prime256v1");
devicePublicKey.generateKeys();
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/test-endpoint",
  keys: {
    p256dh: devicePublicKey.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
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
    assert.equal([...kv.store.keys()].some((key) => key === `fired:${failedKey}`), false);
    failing = false;
    visited.length = 0;
    await runScheduledPush({}, env);
    assert.equal(visited.length, 1);
    assert.ok(JSON.parse(kv.store.get(`fired:${failedKey}`)).lastFiredKey);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
});

test("malformed JSON returns 400 for every push write route", async () => {
  const env = { PUSH_SCHEDULES: new MemoryKv(), PUSH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  for (const handler of [savePushSchedule, deletePushSchedule, sendPushTest]) {
    const request = new Request("https://tfl.example.com/api/push/schedules", {
      method: "POST",
      headers: { Host: "tfl.example.com", Origin: "https://tfl.example.com", "Content-Type": "application/json" },
      body: "{broken",
    });
    const response = await handler({ request, env });
    assert.equal(response.status, 400);
  }
});

test("invalid subscription keys are rejected before storage", async () => {
  const env = { PUSH_SCHEDULES: new MemoryKv(), PUSH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  const response = await savePushSchedule({ env, request: makeRequest({
    subscription: { ...subscription, keys: { ...subscription.keys, p256dh: "A".repeat(88) } }, schedule, clientToken,
  }) });
  assert.equal(response.status, 400);
  assert.equal(env.PUSH_SCHEDULES.store.size, 0);
});

test("Workers rate limiter uses its binding without writing KV counters", async () => {
  const kv = new MemoryKv();
  const checked = [];
  const env = { PUSH_SCHEDULES: kv, PUSH_RATE_LIMITER: { limit: async ({ key }) => {
    checked.push(key);
    return { success: checked.length === 1 };
  } } };
  assert.equal((await savePushSchedule({ env, request: makeRequest({ subscription, schedule, clientToken }) })).status, 200);
  assert.equal((await savePushSchedule({ env, request: makeRequest({ subscription, schedule, clientToken }) })).status, 429);
  assert.equal(checked.length, 2);
  assert.equal([...kv.store.keys()].some((key) => key.startsWith("rate-limit:")), false);
});

async function makeVapidEnv(kv) {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
  return { PUSH_SCHEDULES: kv, VAPID_PUBLIC_KEY: publicKey,
    VAPID_PRIVATE_JWK: JSON.stringify(jwk), VAPID_SUBJECT: "mailto:owner@example.com" };
}

test("cron keeps a concurrent schedule edit and stores delivery state separately", async () => {
  const kv = new MemoryKv();
  const env = await makeVapidEnv(kv);
  const now = new Date();
  const time = `${String(now.getUTCHours()).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 5) * 5).padStart(2, "0")}`;
  const original = { ...schedule, title: "Old title", time, weekdays: [0,1,2,3,4,5,6] };
  const save = (item) => savePushSchedule({ env, request: makeRequest({ subscription, schedule: item, clientToken, timeZone: "UTC" }) });
  assert.equal((await save(original)).status, 200);
  const scheduleKey = [...kv.store.keys()].find((key) => key.startsWith("schedule:"));
  let releaseFeed;
  let feedStarted;
  const started = new Promise((resolve) => { feedStarted = resolve; });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") return new Response(null, { status: 201 });
    feedStarted();
    await new Promise((resolve) => { releaseFeed = resolve; });
    return Response.json([{ modeName: "bus", lineName: "17", destinationName: "Town", timeToStation: 60 }]);
  };
  try {
    const cron = runScheduledPush({}, env);
    await started;
    assert.equal((await save({ ...original, title: "Edited title" })).status, 200);
    releaseFeed();
    await cron;
    assert.equal(JSON.parse(kv.store.get(scheduleKey)).schedule.title, "Edited title");
    assert.ok(JSON.parse(kv.store.get(`fired:${scheduleKey}`)).lastFiredKey);
  } finally { globalThis.fetch = originalFetch; if (releaseFeed) releaseFeed(); }
});

test("permanent push response removes an unusable schedule", async () => {
  const kv = new MemoryKv();
  const env = await makeVapidEnv(kv);
  const now = new Date();
  const time = `${String(now.getUTCHours()).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 5) * 5).padStart(2, "0")}`;
  assert.equal((await savePushSchedule({ env, request: makeRequest({ subscription, clientToken, timeZone: "UTC",
    schedule: { ...schedule, time, weekdays: [0,1,2,3,4,5,6] },
  }) })).status, 200);
  const originalFetch = globalThis.fetch;
  let authHeader;
  globalThis.fetch = async (url, options) => {
    if (options?.method === "POST") {
      authHeader = options.headers.Authorization;
      return new Response("Expired endpoint", { status: 410 });
    }
    return Response.json([{ modeName: "bus", lineName: "17", destinationName: "Town", timeToStation: 60 }]);
  };
  try { await runScheduledPush({}, env); } finally { globalThis.fetch = originalFetch; }
  assert.match(authHeader, /^vapid t=[^,]+, k=/);
  assert.equal([...kv.store.keys()].some((key) => key.startsWith("schedule:")), false);
});

test("push test caps oversized titles and requires a VAPID contact", async () => {
  const kv = new MemoryKv();
  const env = await makeVapidEnv(kv);
  assert.equal((await (await import("../functions/api/push.js")).getPushPublicKey({ env })).status, 200);
  const missingContact = await (await import("../functions/api/push.js")).getPushPublicKey({ env: { ...env, VAPID_SUBJECT: "" } });
  assert.equal((await missingContact.json()).configured, false);
  assert.equal((await savePushSchedule({ env, request: makeRequest({ subscription, schedule, clientToken }) })).status, 200);
  const originalFetch = globalThis.fetch;
  let payloadBytes;
  globalThis.fetch = async (_url, options) => {
    payloadBytes = options.body.byteLength;
    return new Response(null, { status: 201 });
  };
  try {
    const response = await sendPushTest({ env, request: makeRequest({ subscription, clientToken, title: "X".repeat(10_000) }) });
    assert.equal(response.status, 200);
    assert.ok(payloadBytes < 4096);
  } finally { globalThis.fetch = originalFetch; }
});

test("editing an old reminder preserves its delivery state until migration", async () => {
  const kv = new MemoryKv();
  const env = { PUSH_SCHEDULES: kv, PUSH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  const save = (title) => savePushSchedule({ env, request: makeRequest({ subscription,
    schedule: { ...schedule, title }, clientToken, timeZone: "UTC",
  }) });
  assert.equal((await save("Old")).status, 200);
  const key = [...kv.store.keys()].find((item) => item.startsWith("schedule:"));
  const legacy = JSON.parse(kv.store.get(key));
  legacy.lastFiredKey = "2026-10-20T08:00";
  legacy.alertState = { platforms: { train: "2" } };
  kv.store.set(key, JSON.stringify(legacy));
  assert.equal((await save("Edited")).status, 200);
  const saved = JSON.parse(kv.store.get(key));
  assert.equal(saved.schedule.title, "Edited");
  assert.equal(saved.lastFiredKey, legacy.lastFiredKey);
  assert.deepEqual(saved.alertState, legacy.alertState);
});

test("a 400 push response retains the reminder and logs the failure", async () => {
  const kv = new MemoryKv();
  const env = await makeVapidEnv(kv);
  const now = new Date();
  const time = `${String(now.getUTCHours()).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 5) * 5).padStart(2, "0")}`;
  await savePushSchedule({ env, request: makeRequest({ subscription, clientToken, timeZone: "UTC", schedule: { ...schedule, time, weekdays: [0,1,2,3,4,5,6] } }) });
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  globalThis.fetch = async (_url, options) => options?.method === "POST" ? new Response("bad request", { status: 400 }) : Response.json([]);
  console.error = (...args) => logs.push(args);
  try { await runScheduledPush({}, env); } finally { globalThis.fetch = originalFetch; console.error = originalError; }
  assert.ok([...kv.store.keys()].some((key) => key.startsWith("schedule:")));
  assert.equal(logs[0][0], "Scheduled push delivery failed");
  assert.equal(logs[0][1].status, 400);
  assert.equal(JSON.stringify(logs).includes(subscription.endpoint), false);
});

test("push requests use high urgency and a ten minute lifetime", async () => {
  const kv = new MemoryKv();
  const env = await makeVapidEnv(kv);
  await savePushSchedule({ env, request: makeRequest({ subscription, schedule, clientToken }) });
  const originalFetch = globalThis.fetch;
  let headers;
  globalThis.fetch = async (_url, options) => { headers = options.headers; return new Response(null, { status: 201 }); };
  try { await sendPushTest({ env, request: makeRequest({ subscription, clientToken }) }); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(headers.TTL, "600");
  assert.equal(headers.Urgency, "high");
});

test("unchanged schedule sync performs no KV writes, but restores a missing record", async () => {
  const kv = new MemoryKv();
  let writes = 0;
  const put = kv.put.bind(kv);
  kv.put = async (...args) => { writes++; return put(...args); };
  const env = { PUSH_SCHEDULES: kv, PUSH_RATE_LIMITER: { limit: async () => ({ success: true }) } };
  const save = () => savePushSchedule({ env, request: makeRequest({ subscription, schedule, clientToken, timeZone: "UTC" }) });
  assert.equal((await save()).status, 200);
  writes = 0;
  const response = await save();
  assert.equal((await response.json()).unchanged, true);
  assert.equal(writes, 0);
  const key = [...kv.store.keys()].find((item) => item.startsWith("schedule:"));
  await kv.delete(key);
  assert.equal((await save()).status, 200);
  assert.ok(kv.store.has(key));
  assert.ok(writes > 0);
});

test("local signing errors log a safe category without credentials or endpoints", async () => {
  const kv = new MemoryKv();
  const env = { PUSH_SCHEDULES: kv, VAPID_PUBLIC_KEY: "test", VAPID_PRIVATE_JWK: "invalid-secret", VAPID_SUBJECT: "mailto:owner@example.com" };
  const now = new Date();
  const time = `${String(now.getUTCHours()).padStart(2, "0")}:${String(Math.floor(now.getUTCMinutes() / 5) * 5).padStart(2, "0")}`;
  await savePushSchedule({ env, request: makeRequest({ subscription, clientToken, timeZone: "UTC", schedule: { ...schedule, time, weekdays: [0,1,2,3,4,5,6] } }) });
  const originalFetch = globalThis.fetch, originalError = console.error;
  const logs = [];
  globalThis.fetch = async () => Response.json([]);
  console.error = (...args) => logs.push(args);
  try { await runScheduledPush({}, env); } finally { globalThis.fetch = originalFetch; console.error = originalError; }
  assert.equal(logs[0][1].category, "vapid_signing");
  assert.equal(logs[0][1].status, null);
  assert.equal(JSON.stringify(logs).includes("invalid-secret"), false);
  assert.equal(JSON.stringify(logs).includes(subscription.endpoint), false);
});
