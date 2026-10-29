import { onRequestGet as getNationalRailArrivals } from "./national-rail/arrivals.js";
import { onRequestGet as getReadingBusPredictions } from "./reading-buses/predictions.js";
import {
  getDueMinuteKeyFromScheduleKey,
  getScheduleKey,
  normaliseTimeZone,
  parseScheduleKey,
} from "./push-schedule-key.mjs";

const API_BASE = "https://api.tfl.gov.uk";
const SCHEDULE_PREFIX = "schedule:";
const SCHEDULE_INDEX_PREFIX = "schedule-index:";
const FIRED_PREFIX = "fired:";
const RATE_LIMIT_PREFIX = "rate-limit:";
const DEFAULT_TTL_SECONDS = 60 * 60;
const MAX_PUSH_LINES = 3;
const MAX_SCHEDULES_PER_SUBSCRIPTION = 20;
const MAX_SCHEDULE_PAGE_COUNT = 1000;
const MAX_SCHEDULE_BATCH_SIZE = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const WRITE_RATE_LIMIT_MAX = 30;
const TEST_PUSH_RATE_LIMIT_MAX = 10;
const ALLOWED_PUSH_HOSTS = new Set([
  "updates.push.services.mozilla.com",
  "fcm.googleapis.com",
  "android.googleapis.com",
  "web.push.apple.com",
]);

export async function getPushPublicKey({ env }) {
  return json({
    configured: Boolean(env.PUSH_SCHEDULES && env.VAPID_PUBLIC_KEY && getVapidPrivateKey(env) && isValidVapidSubject(env.VAPID_SUBJECT)),
    publicKey: env.VAPID_PUBLIC_KEY || "",
  });
}

export async function savePushSchedule({ request, env }) {
  if (!env.PUSH_SCHEDULES) {
    return json({ error: "Server push storage is not configured." }, 501);
  }

  const guard = validateWriteRequest(request);
  if (guard) return guard;
  const rateLimit = await enforceWriteRateLimit(request, env, "save-schedule", WRITE_RATE_LIMIT_MAX);
  if (rateLimit) return rateLimit;

  const payload = await readJsonBody(request);
  if (!payload) return json({ error: "A valid JSON body is required." }, 400);
  const subscription = normaliseSubscription(payload.subscription);
  const schedule = normaliseSchedule(payload.schedule);
  const timeZone = normaliseTimeZone(payload.timeZone);
  const clientToken = normaliseClientToken(payload.clientToken);

  if (!subscription || !(await hasValidSubscriptionKeys(subscription)) || !schedule || !clientToken) {
    return json({ error: "A valid push subscription, schedule, and device token are required." }, 400);
  }

  const endpointHash = await sha256(subscription.endpoint);
  const meta = await getEndpointMeta(env, endpointHash);
  const key = getScheduleKey(endpointHash, schedule, timeZone);
  const indexKey = getScheduleIndexKey(endpointHash, schedule.id);
  const index = await env.PUSH_SCHEDULES.get(indexKey, "json");
  const existingKey = index?.key || meta.schedules[schedule.id] || getLegacyScheduleKey(endpointHash, schedule.id);
  const existing = existingKey ? await env.PUSH_SCHEDULES.get(existingKey, "json") : null;
  const clientTokenHash = await sha256(clientToken);

  if ((index?.clientTokenHash && index.clientTokenHash !== clientTokenHash) ||
      (existing?.clientTokenHash && existing.clientTokenHash !== clientTokenHash)) {
    return json({ error: "This schedule belongs to another device." }, 403);
  }

  const isNewSchedule = !meta.schedules[schedule.id] && !existing;
  if (isNewSchedule && meta.count >= MAX_SCHEDULES_PER_SUBSCRIPTION) {
    return json({ error: `Only ${MAX_SCHEDULES_PER_SUBSCRIPTION} server schedules can be saved on one device.` }, 429);
  }

  await env.PUSH_SCHEDULES.put(
    key,
    JSON.stringify({
      subscription,
      schedule,
      timeZone,
      clientTokenHash,
      ...(existing?.lastFiredKey || existing?.alertState ? {
        lastFiredKey: existing.lastFiredKey || "",
        alertState: existing.alertState || {},
      } : {}),
      updatedAt: new Date().toISOString(),
    }),
  );
  await env.PUSH_SCHEDULES.put(indexKey, JSON.stringify({ key, clientTokenHash }));
  if (existingKey && existingKey !== key) {
    await env.PUSH_SCHEDULES.delete(existingKey);
    await env.PUSH_SCHEDULES.delete(getFiredKey(existingKey));
  }

  return json({ ok: true, scheduleId: schedule.id });
}

export async function deletePushSchedule({ request, env }) {
  if (!env.PUSH_SCHEDULES) {
    return json({ ok: true, skipped: "Server push storage is not configured." });
  }

  const guard = validateWriteRequest(request);
  if (guard) return guard;
  const rateLimit = await enforceWriteRateLimit(request, env, "delete-schedule", WRITE_RATE_LIMIT_MAX);
  if (rateLimit) return rateLimit;

  const payload = await readJsonBody(request);
  if (!payload) return json({ error: "A valid JSON body is required." }, 400);
  const endpoint = String(payload.endpoint || "");
  const scheduleId = String(payload.scheduleId || "");
  const clientToken = normaliseClientToken(payload.clientToken);
  if (!endpoint || !scheduleId || !clientToken) {
    return json({ error: "Endpoint, scheduleId, and device token are required." }, 400);
  }

  const endpointHash = await sha256(endpoint);
  const normalisedScheduleId = normaliseScheduleId(scheduleId);
  if (!normalisedScheduleId) return json({ error: "A valid schedule ID is required." }, 400);
  const indexKey = getScheduleIndexKey(endpointHash, normalisedScheduleId);
  const index = await env.PUSH_SCHEDULES.get(indexKey, "json");
  const clientTokenHash = await sha256(clientToken);
  // Scan all old time-based keys, including records lost by the former shared index.
  const keys = new Set(await listScheduleKeys(env, `${SCHEDULE_PREFIX}${endpointHash}:${normalisedScheduleId}:`));
  keys.add(getLegacyScheduleKey(endpointHash, normalisedScheduleId));
  if (index?.key) keys.add(index.key);
  const records = await Promise.all([...keys].map((key) => env.PUSH_SCHEDULES.get(key, "json")));
  if ((index?.clientTokenHash && index.clientTokenHash !== clientTokenHash) ||
      records.some((stored) => stored?.clientTokenHash && stored.clientTokenHash !== clientTokenHash)) {
    return json({ error: "This schedule belongs to another device." }, 403);
  }
  // Keep a tombstone to suppress old records once the deletion propagates through KV.
  await env.PUSH_SCHEDULES.put(indexKey, JSON.stringify({ key: null, clientTokenHash }));
  await Promise.all([...keys].flatMap((key) => [
    env.PUSH_SCHEDULES.delete(key),
    env.PUSH_SCHEDULES.delete(getFiredKey(key)),
  ]));
  return json({ ok: true });
}

export async function sendPushTest({ request, env }) {
  if (!env.PUSH_SCHEDULES) {
    return json({ error: "Server push storage is not configured." }, 501);
  }

  const guard = validateWriteRequest(request);
  if (guard) return guard;
  const rateLimit = await enforceWriteRateLimit(request, env, "test-push", TEST_PUSH_RATE_LIMIT_MAX);
  if (rateLimit) return rateLimit;

  const payload = await readJsonBody(request);
  if (!payload) return json({ error: "A valid JSON body is required." }, 400);
  const subscription = normaliseSubscription(payload.subscription);
  const clientToken = normaliseClientToken(payload.clientToken);
  if (!subscription || !(await hasValidSubscriptionKeys(subscription)) || !clientToken) {
    return json({ error: "A valid push subscription and device token are required." }, 400);
  }
  if (!(await hasSavedPushEndpoint(env, subscription, clientToken))) {
    return json({ error: "Save a server push schedule on this device before sending a test push." }, 403);
  }

  const result = await sendWebPush(
    subscription,
    {
      title: String(payload.title || "Live TfL Arrivals").slice(0, 120),
      body: "Server push notification is working.",
      url: normaliseSameOriginPath(payload.url),
    },
    env,
  );

  return json({ ok: result.ok, status: result.status, help: result.help || "" }, result.ok ? 200 : 502);
}

export async function runScheduledPush(_controller, env) {
  if (!env.PUSH_SCHEDULES || !env.VAPID_PUBLIC_KEY || !getVapidPrivateKey(env)) return;

  let cursor;
  do {
    const page = await env.PUSH_SCHEDULES.list({ prefix: SCHEDULE_PREFIX, cursor, limit: MAX_SCHEDULE_PAGE_COUNT });
    cursor = page.list_complete ? undefined : page.cursor;
    const dueKeys = page.keys
      .map((item) => ({ name: item.name, dueKey: getDueMinuteKeyFromScheduleKey(item.name) }))
      .filter((item) => item.dueKey);
    for (let index = 0; index < dueKeys.length; index += MAX_SCHEDULE_BATCH_SIZE) {
      const batch = dueKeys.slice(index, index + MAX_SCHEDULE_BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((item) => processStoredSchedule(item.name, env, item.dueKey)));
      for (const result of results) {
        if (result.status === "rejected") {
          // Leave failed records unmarked so the next cron can retry within the catch-up window.
          console.error("Scheduled reminder processing failed", result.reason?.message || "Unknown error");
        }
      }
    }
  } while (cursor);
}

async function processStoredSchedule(key, env, dueKey) {
  const stored = await env.PUSH_SCHEDULES.get(key, "json");
  if (!stored?.subscription || !stored?.schedule) return null;
  if (!(await isCurrentScheduleKey(env, key))) return null;

  const firedKey = getFiredKey(key);
  const fired = await env.PUSH_SCHEDULES.get(firedKey, "json") || {
    lastFiredKey: stored.lastFiredKey || "",
    alertState: stored.alertState || {},
  };
  if (!dueKey || fired.lastFiredKey === dueKey) return null;

  const notification = await getScheduleNotification(stored.schedule, env, fired.alertState);
  fired.alertState = notification.alertState;
  if (!notification.body) {
    if (!(await isCurrentScheduleKey(env, key))) return null;
    fired.lastFiredKey = dueKey;
    fired.lastFiredAt = new Date().toISOString();
    await env.PUSH_SCHEDULES.put(firedKey, JSON.stringify(fired));
    return { gone: false, key };
  }
  if (!(await isCurrentScheduleKey(env, key))) return null;
  const result = await sendWebPush(
    stored.subscription,
    {
      title: stored.schedule.title || "Live TfL Arrivals",
      body: notification.body,
      url: normaliseSameOriginPath(stored.schedule.pageUrl),
    },
    env,
  );

  if (result.gone) {
    console.warn("Scheduled push subscription is no longer valid", { status: result.status || null });
    await Promise.all([env.PUSH_SCHEDULES.delete(key), env.PUSH_SCHEDULES.delete(firedKey)]);
    return { gone: true, key };
  }

  if (result.ok) {
    fired.lastFiredKey = dueKey;
    fired.lastFiredAt = new Date().toISOString();
    await env.PUSH_SCHEDULES.put(firedKey, JSON.stringify(fired));
  } else {
    // Avoid logging subscription endpoints, payloads, or upstream response bodies.
    console.error("Scheduled push delivery failed", { status: result.status || null });
  }
  return { gone: false, key };
}

function validateWriteRequest(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!isSameOriginPost(request)) {
    return json({ error: "Server push changes must come from this website." }, 403);
  }

  return null;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function isSameOriginPost(request) {
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function enforceWriteRateLimit(request, env, action, limit) {
  if (env.PUSH_RATE_LIMITER) {
    const { success } = await env.PUSH_RATE_LIMITER.limit({ key: `${action}:${getClientAddress(request)}` });
    return success ? null : json({ error: "Too many push requests. Please wait a minute and try again." }, 429);
  }
  if (!env.PUSH_SCHEDULES) return null;
  const clientKey = await sha256(`${getClientAddress(request)}:${action}`);
  const windowId = Math.floor(Date.now() / (RATE_LIMIT_WINDOW_SECONDS * 1000));
  const key = `${RATE_LIMIT_PREFIX}${action}:${windowId}:${clientKey}`;
  const current = Number.parseInt(await env.PUSH_SCHEDULES.get(key), 10) || 0;
  if (current >= limit) {
    return json({ error: "Too many push requests. Please wait a minute and try again." }, 429);
  }
  await env.PUSH_SCHEDULES.put(key, String(current + 1), { expirationTtl: RATE_LIMIT_WINDOW_SECONDS * 2 });
  return null;
}

function getClientAddress(request) {
  const forwardedFor = request.headers.get("CF-Connecting-IP") ||
    request.headers.get("True-Client-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "";
  return forwardedFor.split(",")[0].trim() || "unknown-client";
}

export async function hasSavedPushEndpoint(env, subscription, clientToken) {
  const endpointHash = await sha256(subscription.endpoint);
  const meta = await getEndpointMeta(env, endpointHash);
  const keys = Object.values(meta.schedules || {});
  if (!keys.length) return false;

  const clientTokenHash = await sha256(clientToken);
  const storedSchedules = await Promise.all(keys.slice(0, MAX_SCHEDULES_PER_SUBSCRIPTION).map((key) => env.PUSH_SCHEDULES.get(key, "json")));
  return storedSchedules.some((stored) => stored?.clientTokenHash === clientTokenHash);
}

async function getScheduleNotification(schedule, env, previousAlertState = {}) {
  try {
    if (schedule.alertOnly) {
      return await getScheduleAlerts(schedule, env, previousAlertState);
    }
    const lines = schedule.type === "bus" ? await getBusLines(schedule, env) : await getTrainLines(schedule, env);
    return {
      body: lines.length
        ? lines.join(" | ")
        : `No live ${schedule.type === "bus" ? "bus" : "train"} times are available right now.`,
      alertState: previousAlertState,
    };
  } catch (error) {
    if (schedule.alertOnly) throw error;
    return {
      body: error.message || "Live transport times could not be loaded.",
      alertState: previousAlertState,
    };
  }
}

async function getScheduleAlerts(schedule, env, previousAlertState) {
  const arrivals = schedule.type === "bus"
    ? schedule.provider === "reading-buses"
      ? await getReadingBusArrivals(schedule.stopId, env)
      : await getTflArrivals(schedule.stopId, "bus", env)
    : shouldUseNationalRailDeparturesForLine(schedule)
      ? await getNationalRailScheduleArrivals(schedule.crs, env, schedule.lineId === "elizabeth" ? "elizabeth-line" : "")
      : await getTflArrivals(schedule.stationId, "train", env);
  const filteredArrivals = arrivals
    .filter((arrival) => !schedule.route || String(arrival.lineName || arrival.lineId) === schedule.route)
    .filter((arrival) => schedule.type !== "train" || shouldUseNationalRailDeparturesForLine(schedule) || arrival.lineId === schedule.lineId || arrival.modeName === schedule.lineId)
    .filter((arrival) => !schedule.destination || cleanName(arrival.destinationName) === schedule.destination);
  const disruption = await getLineDisruption(schedule, env);
  return buildTransportAlertResult(filteredArrivals, schedule, previousAlertState, disruption);
}

function getArrivalAlertKey(arrival) {
  const directId = cleanName(arrival.vehicleId || arrival.id);
  if (directId) return directId;
  const parts = [
    arrival.lineId || arrival.lineName,
    cleanName(arrival.destinationName),
    arrival.scheduledArrival || arrival.expectedArrival,
  ].map(cleanName);
  return parts.some(Boolean) ? parts.join("|") : "";
}

export function buildTransportAlertResult(arrivals, schedule = {}, previousAlertState = {}, disruption = "", checkedAt = new Date().toISOString()) {
  const alerts = [];
  const nextPlatforms = {};

  arrivals.forEach((arrival) => {
    const destination = cleanName(arrival.destinationName);
    const service = `${arrival.lineName || schedule.lineName || "Service"}${destination ? ` to ${destination}` : ""}`;
    if (arrival.serviceStatus === "cancelled") alerts.push(`${service} cancelled`);
    if (arrival.serviceStatus === "delayed") alerts.push(`${service} delayed`);

    const key = getArrivalAlertKey(arrival);
    const platform = cleanName(arrival.platformName);
    if (!key || !platform) return;
    nextPlatforms[key] = platform;
    const previousPlatform = previousAlertState?.platforms?.[key];
    if (previousPlatform && previousPlatform !== platform) {
      alerts.push(`${arrival.lineName || schedule.lineName || "Service"} platform changed from ${previousPlatform} to ${platform}`);
    }
  });

  if (disruption) alerts.push(disruption);
  return {
    body: [...new Set(alerts)].slice(0, MAX_PUSH_LINES).join(" | "),
    alertState: {
      platforms: nextPlatforms,
      checkedAt,
    },
  };
}

async function getLineDisruption(schedule, env) {
  const lineId = schedule.type === "bus" ? schedule.route : schedule.lineId;
  if (!lineId || lineId === "national-rail" || schedule.provider === "reading-buses") return "";
  const url = new URL(`${API_BASE}/Line/${encodeURIComponent(lineId)}/Status`);
  if (env.TFL_APP_KEY) url.searchParams.set("app_key", env.TFL_APP_KEY);
  if (env.TFL_APP_ID) url.searchParams.set("app_id", env.TFL_APP_ID);
  const response = await fetch(url);
  if (!response.ok) return "";
  const status = (await response.json())?.[0]?.lineStatuses?.[0];
  const description = cleanName(status?.statusSeverityDescription);
  if (!description || description.toLowerCase() === "good service") return "";
  return `${schedule.lineName || lineId}: ${description}${status?.reason ? ` - ${cleanName(status.reason)}` : ""}`;
}

async function getBusLines(schedule, env) {
  const arrivals = schedule.provider === "reading-buses"
    ? await getReadingBusArrivals(schedule.stopId, env)
    : await getTflArrivals(schedule.stopId, "bus", env);

  return arrivals
    .filter((arrival) => !schedule.route || String(arrival.lineName || arrival.lineId) === schedule.route)
    .filter((arrival) => !schedule.destination || cleanName(arrival.destinationName) === schedule.destination)
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .slice(0, MAX_PUSH_LINES)
    .map((arrival) => `${arrival.lineName || arrival.lineId} ${cleanName(arrival.destinationName)} ${formatEta(arrival.timeToStation)}`);
}

async function getTrainLines(schedule, env) {
  const usesDepartureBoard = shouldUseNationalRailDeparturesForLine(schedule);
  const arrivals = usesDepartureBoard
    ? await getNationalRailScheduleArrivals(schedule.crs, env, schedule.lineId === "elizabeth" ? "elizabeth-line" : "")
    : await getTflArrivals(schedule.stationId, "train", env);

  return arrivals
    .filter((arrival) => usesDepartureBoard || arrival.lineId === schedule.lineId || arrival.modeName === schedule.lineId)
    .filter((arrival) => !schedule.destination || cleanName(arrival.destinationName) === schedule.destination)
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .slice(0, MAX_PUSH_LINES)
    .map((arrival) => `${arrival.lineName || schedule.lineName || "Train"} ${cleanName(arrival.destinationName)} ${formatEta(arrival.timeToStation, arrival.serviceStatus)}`);
}

async function getReadingBusArrivals(location, env) {
  const request = new Request(`https://worker.local/api/reading-buses/predictions?location=${encodeURIComponent(location || "")}`);
  const response = await getReadingBusPredictions({ request, env });
  const data = await response.json();
  if (!response.ok) throw new Error(data.help || data.error || "Reading bus times could not be loaded.");
  return data.arrivals || [];
}

async function getNationalRailScheduleArrivals(crs, env, operator = "") {
  const params = new URLSearchParams({
    crs: crs || "",
    rows: "10",
  });
  if (operator) params.set("operator", operator);
  const request = new Request(`https://worker.local/api/national-rail/arrivals?${params.toString()}`);
  const response = await getNationalRailArrivals({ request, env });
  const data = await response.json();
  if (!response.ok) throw new Error(data.help || data.error || "National Rail times could not be loaded.");
  return data.arrivals || [];
}

function shouldUseNationalRailDeparturesForLine(schedule) {
  return Boolean(schedule.crs) && (schedule.lineId === "national-rail" || schedule.lineId === "elizabeth");
}

async function getTflArrivals(stopId, type, env) {
  const url = new URL(`${API_BASE}/StopPoint/${encodeURIComponent(stopId || "")}/Arrivals`);
  if (env.TFL_APP_KEY) url.searchParams.set("app_key", env.TFL_APP_KEY);
  if (env.TFL_APP_ID) url.searchParams.set("app_id", env.TFL_APP_ID);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`TfL times could not be loaded, status ${response.status}.`);
  const arrivals = await response.json();
  return arrivals.filter((arrival) => type === "bus" ? arrival.modeName === "bus" : arrival.modeName !== "bus");
}

async function sendWebPush(subscription, payload, env) {
  try {
    const vapidPrivateKey = getVapidPrivateKey(env);
    if (!env.VAPID_PUBLIC_KEY || !vapidPrivateKey) {
      return { ok: false, help: "VAPID keys are not configured." };
    }

    let encrypted;
    try {
      encrypted = await encryptPushPayload(subscription, JSON.stringify(payload));
    } catch (error) {
      return { ok: false, gone: error.name === "DataError", help: error.message };
    }
    const jwt = await createVapidJwt(subscription.endpoint, env);
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(DEFAULT_TTL_SECONDS),
      },
      body: encrypted,
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      gone: [404, 410].includes(response.status),
      status: response.status,
      help: response.ok ? "" : await response.text(),
    };
  } catch (error) {
    return { ok: false, help: error.message };
  }
}

async function encryptPushPayload(subscription, payloadText) {
  const userPublicKey = base64UrlToUint8Array(subscription.keys.p256dh);
  const authSecret = base64UrlToUint8Array(subscription.keys.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const appServerKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const appServerPublicKey = new Uint8Array(await crypto.subtle.exportKey("raw", appServerKeys.publicKey));
  const userKey = await crypto.subtle.importKey("raw", userPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: userKey }, appServerKeys.privateKey, 256));

  const keyInfo = concatBytes(textBytes("WebPush: info\0"), userPublicKey, appServerPublicKey);
  const ikm = await hmac(await hmac(authSecret, sharedSecret), concatBytes(keyInfo, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, textBytes("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmac(prk, textBytes("Content-Encoding: nonce\0\x01"))).slice(0, 12);
  const plaintext = concatBytes(textBytes(payloadText), new Uint8Array([2]));
  const key = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));
  const recordSize = new Uint8Array([0, 0, 16, 0]);
  return concatBytes(salt, recordSize, new Uint8Array([appServerPublicKey.length]), appServerPublicKey, ciphertext);
}

async function createVapidJwt(endpoint, env) {
  if (!isValidVapidSubject(env.VAPID_SUBJECT)) {
    throw new Error("VAPID_SUBJECT must be a contact mailto: or HTTPS URL.");
  }
  const origin = new URL(endpoint).origin;
  const header = base64UrlEncode(textBytes(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = base64UrlEncode(textBytes(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT,
  })));
  const token = `${header}.${body}`;
  const key = await importVapidPrivateKey(env);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textBytes(token)));
  return `${token}.${base64UrlEncode(normaliseEcdsaSignature(signature))}`;
}

function isValidVapidSubject(value) {
  return /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$|^https:\/\/[^\s]+$/i.test(value || "");
}

async function importVapidPrivateKey(env) {
  const jwkText = getVapidPrivateKey(env);
  let jwk;
  try {
    jwk = JSON.parse(jwkText);
  } catch {
    throw new Error("VAPID_PRIVATE_JWK must be a JSON Web Key.");
  }

  return crypto.subtle.importKey(
    "jwk",
    {
      ...jwk,
      key_ops: ["sign"],
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

function normaliseEcdsaSignature(signature) {
  if (signature.length === 64) return signature;
  if (signature[0] !== 0x30) return signature;

  let offset = 2;
  if (signature[offset] !== 0x02) return signature;
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;
  if (signature[offset] !== 0x02) return signature;
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);
  return concatBytes(trimInteger(r), trimInteger(s));
}

function trimInteger(value) {
  const trimmed = value[0] === 0 ? value.slice(1) : value;
  if (trimmed.length === 32) return trimmed;
  if (trimmed.length > 32) return trimmed.slice(trimmed.length - 32);
  const padded = new Uint8Array(32);
  padded.set(trimmed, 32 - trimmed.length);
  return padded;
}

function getVapidPrivateKey(env) {
  return env.VAPID_PRIVATE_JWK || env.VAPID_PRIVATE_KEY_JWK || "";
}

function normaliseSubscription(subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return null;
  let endpoint;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch {
    return null;
  }

  if (endpoint.protocol !== "https:" || !isAllowedPushHost(endpoint.hostname)) return null;
  const p256dh = String(subscription.keys.p256dh);
  const auth = String(subscription.keys.auth);
  if (!isBase64UrlToken(p256dh, 80, 180) || !isBase64UrlToken(auth, 16, 80)) return null;

  return {
    endpoint: endpoint.href,
    keys: {
      p256dh,
      auth,
    },
  };
}

async function hasValidSubscriptionKeys(subscription) {
  try {
    const publicKey = base64UrlToUint8Array(subscription.keys.p256dh);
    const auth = base64UrlToUint8Array(subscription.keys.auth);
    if (publicKey.length !== 65 || publicKey[0] !== 4 || auth.length !== 16) return false;
    await crypto.subtle.importKey("raw", publicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
    return true;
  } catch {
    return false;
  }
}

function normaliseSchedule(schedule) {
  if (!schedule?.id || !schedule?.type || !schedule?.time || !Array.isArray(schedule.weekdays)) return null;
  const id = normaliseScheduleId(schedule.id);
  const time = String(schedule.time).slice(0, 5);
  if (!id || !isValidTime(time)) return null;

  return {
    id,
    type: schedule.type === "train" ? "train" : "bus",
    title: String(schedule.title || "Live transport reminder").slice(0, 120),
    subtitle: String(schedule.subtitle || "").slice(0, 180),
    time,
    weekdays: schedule.weekdays.map((day) => Number.parseInt(day, 10)).filter((day) => day >= 0 && day <= 6),
    stopId: String(schedule.stopId || "").slice(0, 120),
    provider: String(schedule.provider || "tfl").slice(0, 40),
    route: String(schedule.route || "").slice(0, 80),
    destination: String(schedule.destination || "").slice(0, 120),
    stationId: String(schedule.stationId || "").slice(0, 120),
    crs: String(schedule.crs || "").slice(0, 3).toUpperCase(),
    lineId: String(schedule.lineId || "").slice(0, 80),
    lineName: String(schedule.lineName || "").slice(0, 120),
    alertOnly: Boolean(schedule.alertOnly),
    pageUrl: normaliseSameOriginPath(schedule.pageUrl),
  };
}

function normaliseScheduleId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function normaliseClientToken(value) {
  const token = String(value || "");
  return /^[a-zA-Z0-9_-]{32,160}$/.test(token) ? token : "";
}

function normaliseSameOriginPath(value) {
  try {
    const url = new URL(String(value || "/"), "https://live-tfl-arrivals.local");
    if (url.origin !== "https://live-tfl-arrivals.local") return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value))) return false;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && minutes % 5 === 0;
}

function isAllowedPushHost(hostname) {
  if (ALLOWED_PUSH_HOSTS.has(hostname)) return true;
  return hostname.endsWith(".push.apple.com") || hostname.endsWith(".notify.windows.com");
}

function isBase64UrlToken(value, minLength, maxLength) {
  return value.length >= minLength && value.length <= maxLength && /^[a-zA-Z0-9_-]+$/.test(value);
}

async function listScheduleKeys(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const page = await env.PUSH_SCHEDULES.list({ prefix, cursor, limit: MAX_SCHEDULE_PAGE_COUNT });
    keys.push(...page.keys.map((item) => item.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

async function isCurrentScheduleKey(env, key) {
  const parsed = parseScheduleKey(key);
  if (!parsed) return true;
  const index = await env.PUSH_SCHEDULES.get(getScheduleIndexKey(parsed.endpointHash, parsed.scheduleId), "json");
  return !index || index.key === key;
}

async function getEndpointMeta(env, endpointHash) {
  // Derive the inventory from independent records; never overwrite a shared map.
  const keys = await listScheduleKeys(env, `${SCHEDULE_PREFIX}${endpointHash}:`);
  const schedules = {};
  const current = await Promise.all(keys.map((key) => isCurrentScheduleKey(env, key)));
  for (const [index, key] of keys.entries()) {
    if (!current[index]) continue;
    const id = parseScheduleKey(key)?.scheduleId || key.split(":")[2];
    if (id) schedules[id] = key;
  }
  return { schedules, count: Object.keys(schedules).length };
}

function getScheduleIndexKey(endpointHash, scheduleId) {
  return `${SCHEDULE_INDEX_PREFIX}${endpointHash}:${normaliseScheduleId(scheduleId)}`;
}

function getFiredKey(scheduleKey) {
  return `${FIRED_PREFIX}${scheduleKey}`;
}

function getLegacyScheduleKey(endpointHash, scheduleId) {
  return `${SCHEDULE_PREFIX}${endpointHash}:${normaliseScheduleId(scheduleId)}`;
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatEta(seconds, serviceStatus = "") {
  if (serviceStatus === "cancelled") return "cancelled";
  if (serviceStatus === "delayed") return "delayed";
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
  if (minutes <= 0) return "due";
  if (minutes === 1) return "1 min";
  return `${minutes} mins`;
}

async function sha256(value) {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", textBytes(value))));
}

async function hmac(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}

function base64UrlToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function base64UrlEncode(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function concatBytes(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function json(payload, status = 200) {
  return Response.json(payload, { status });
}
