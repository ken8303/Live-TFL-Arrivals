import { onRequestGet as getNationalRailArrivals } from "./national-rail/arrivals.js";
import { onRequestGet as getReadingBusPredictions } from "./reading-buses/predictions.js";

const API_BASE = "https://api.tfl.gov.uk";
const SCHEDULE_PREFIX = "schedule:";
const RATE_LIMIT_PREFIX = "push-rate:";
const DEFAULT_TTL_SECONDS = 60 * 60;
const MAX_PUSH_LINES = 3;
const MAX_SCHEDULES_PER_SUBSCRIPTION = 20;
const MAX_SCHEDULE_PAGE_COUNT = 20;
const MAX_SCHEDULE_BATCH_SIZE = 10;
const SCHEDULE_CATCHUP_MINUTES = 5;
const LONDON_TIME_ZONE = "Europe/London";
const ALLOWED_PUSH_HOSTS = new Set([
  "updates.push.services.mozilla.com",
  "fcm.googleapis.com",
  "android.googleapis.com",
  "web.push.apple.com",
]);

export async function getPushPublicKey({ env }) {
  return json({
    configured: Boolean(env.PUSH_SCHEDULES && env.VAPID_PUBLIC_KEY && getVapidPrivateKey(env)),
    publicKey: env.VAPID_PUBLIC_KEY || "",
  });
}

export async function savePushSchedule({ request, env }) {
  if (!env.PUSH_SCHEDULES) {
    return json({ error: "Server push storage is not configured." }, 501);
  }

  const guard = await validateWriteRequest(request, env, { limit: 30 });
  if (guard) return guard;

  const payload = await request.json();
  const subscription = normaliseSubscription(payload.subscription);
  const schedule = normaliseSchedule(payload.schedule);
  const timeZone = normaliseTimeZone(payload.timeZone);
  const clientToken = normaliseClientToken(payload.clientToken);

  if (!subscription || !schedule || !clientToken) {
    return json({ error: "A valid push subscription, schedule, and device token are required." }, 400);
  }

  const endpointHash = await sha256(subscription.endpoint);
  const key = getScheduleKey(endpointHash, schedule.id);
  const existing = await env.PUSH_SCHEDULES.get(key, "json");
  const clientTokenHash = await sha256(clientToken);

  if (existing?.clientTokenHash && existing.clientTokenHash !== clientTokenHash) {
    return json({ error: "This schedule belongs to another device." }, 403);
  }

  const scheduleCount = await countSchedulesForEndpoint(env, endpointHash);
  if (!existing && scheduleCount >= MAX_SCHEDULES_PER_SUBSCRIPTION) {
    return json({ error: `Only ${MAX_SCHEDULES_PER_SUBSCRIPTION} server schedules can be saved on one device.` }, 429);
  }

  await env.PUSH_SCHEDULES.put(
    key,
    JSON.stringify({
      subscription,
      schedule,
      timeZone,
      clientTokenHash,
      lastFiredKey: existing?.lastFiredKey || "",
      updatedAt: new Date().toISOString(),
    }),
  );

  return json({ ok: true, scheduleId: schedule.id });
}

export async function deletePushSchedule({ request, env }) {
  if (!env.PUSH_SCHEDULES) {
    return json({ ok: true, skipped: "Server push storage is not configured." });
  }

  const guard = await validateWriteRequest(request, env, { limit: 30 });
  if (guard) return guard;

  const payload = await request.json();
  const endpoint = String(payload.endpoint || "");
  const scheduleId = String(payload.scheduleId || "");
  const clientToken = normaliseClientToken(payload.clientToken);
  if (!endpoint || !scheduleId || !clientToken) {
    return json({ error: "Endpoint, scheduleId, and device token are required." }, 400);
  }

  const endpointHash = await sha256(endpoint);
  const key = getScheduleKey(endpointHash, normaliseScheduleId(scheduleId));
  const existing = await env.PUSH_SCHEDULES.get(key, "json");
  if (existing?.clientTokenHash && existing.clientTokenHash !== await sha256(clientToken)) {
    return json({ error: "This schedule belongs to another device." }, 403);
  }
  await env.PUSH_SCHEDULES.delete(key);
  return json({ ok: true });
}

export async function sendPushTest({ request, env }) {
  const guard = await validateWriteRequest(request, env, { limit: 5 });
  if (guard) return guard;

  const payload = await request.json();
  const subscription = normaliseSubscription(payload.subscription);
  const clientToken = normaliseClientToken(payload.clientToken);
  if (!subscription || !clientToken) {
    return json({ error: "A valid push subscription and device token are required." }, 400);
  }

  const result = await sendWebPush(
    subscription,
    {
      title: payload.title || "Live TfL Arrivals",
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
    cursor = page.cursor;
    for (let index = 0; index < page.keys.length; index += MAX_SCHEDULE_BATCH_SIZE) {
      const batch = page.keys.slice(index, index + MAX_SCHEDULE_BATCH_SIZE);
      await Promise.all(batch.map((item) => processStoredSchedule(item.name, env)));
    }
  } while (cursor);
}

async function processStoredSchedule(key, env) {
  const stored = await env.PUSH_SCHEDULES.get(key, "json");
  if (!stored?.subscription || !stored?.schedule) return;

  const dueKey = getDueMinuteKey(stored.schedule, stored.timeZone || LONDON_TIME_ZONE);
  if (!dueKey || stored.lastFiredKey === dueKey) return;

  const body = await getScheduleBody(stored.schedule, env);
  const result = await sendWebPush(
    stored.subscription,
    {
      title: stored.schedule.title || "Live TfL Arrivals",
      body,
      url: normaliseSameOriginPath(stored.schedule.pageUrl),
    },
    env,
  );

  if (result.gone) {
    await env.PUSH_SCHEDULES.delete(key);
    return;
  }

  if (result.ok) {
    stored.lastFiredKey = dueKey;
    stored.lastFiredAt = new Date().toISOString();
    await env.PUSH_SCHEDULES.put(key, JSON.stringify(stored));
  }
}

function getDueMinuteKey(schedule, timeZone) {
  const now = new Date();
  const parts = getTimeZoneParts(now, timeZone);
  if (!parts || !isValidTime(schedule.time)) return "";
  if (!Array.isArray(schedule.weekdays) || !schedule.weekdays.includes(parts.weekday)) return "";

  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [scheduleHour, scheduleMinute] = schedule.time.split(":").map(Number);
  const scheduleMinutes = scheduleHour * 60 + scheduleMinute;
  if (currentMinutes < scheduleMinutes || currentMinutes > scheduleMinutes + SCHEDULE_CATCHUP_MINUTES) return "";

  return `${parts.year}-${parts.month}-${parts.day}T${schedule.time}`;
}

function getTimeZoneParts(date, timeZone) {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour,
      minute: parts.minute,
      weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
    };
  } catch {
    return null;
  }
}

async function validateWriteRequest(request, env, { limit }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  if (!isSameOriginPost(request)) {
    return json({ error: "Server push changes must come from this website." }, 403);
  }

  if (env.PUSH_SCHEDULES) {
    const rateKey = `${RATE_LIMIT_PREFIX}${await sha256(getClientAddress(request))}`;
    const count = Number(await env.PUSH_SCHEDULES.get(rateKey) || "0");
    if (count >= limit) {
      return json({ error: "Too many scheduler requests. Please wait a minute and try again." }, 429);
    }
    await env.PUSH_SCHEDULES.put(rateKey, String(count + 1), { expirationTtl: 60 });
  }

  return null;
}

function isSameOriginPost(request) {
  const origin = request.headers.get("Origin");
  const host = request.headers.get("Host");
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getClientAddress(request) {
  return request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "unknown";
}

async function countSchedulesForEndpoint(env, endpointHash) {
  let cursor;
  let count = 0;
  do {
    const page = await env.PUSH_SCHEDULES.list({
      prefix: `${SCHEDULE_PREFIX}${endpointHash}:`,
      cursor,
      limit: MAX_SCHEDULE_PAGE_COUNT,
    });
    count += page.keys.length;
    cursor = page.cursor;
    if (count >= MAX_SCHEDULES_PER_SUBSCRIPTION) return count;
  } while (cursor);
  return count;
}

async function getScheduleBody(schedule, env) {
  try {
    const lines = schedule.type === "bus" ? await getBusLines(schedule, env) : await getTrainLines(schedule, env);
    return lines.length
      ? lines.join(" | ")
      : `No live ${schedule.type === "bus" ? "bus" : "train"} times are available right now.`;
  } catch (error) {
    return error.message || "Live transport times could not be loaded.";
  }
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
  const arrivals = schedule.lineId === "national-rail" && schedule.crs
    ? await getNationalRailScheduleArrivals(schedule.crs, env)
    : await getTflArrivals(schedule.stationId, "train", env);

  return arrivals
    .filter((arrival) => schedule.lineId === "national-rail" || arrival.lineId === schedule.lineId || arrival.modeName === schedule.lineId)
    .filter((arrival) => !schedule.destination || cleanName(arrival.destinationName) === schedule.destination)
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .slice(0, MAX_PUSH_LINES)
    .map((arrival) => `${arrival.lineName || schedule.lineName || "Train"} ${cleanName(arrival.destinationName)} ${formatEta(arrival.timeToStation)}`);
}

async function getReadingBusArrivals(location, env) {
  const request = new Request(`https://worker.local/api/reading-buses/predictions?location=${encodeURIComponent(location || "")}`);
  const response = await getReadingBusPredictions({ request, env });
  const data = await response.json();
  if (!response.ok) throw new Error(data.help || data.error || "Reading bus times could not be loaded.");
  return data.arrivals || [];
}

async function getNationalRailScheduleArrivals(crs, env) {
  const request = new Request(`https://worker.local/api/national-rail/arrivals?crs=${encodeURIComponent(crs || "")}&rows=10`);
  const response = await getNationalRailArrivals({ request, env });
  const data = await response.json();
  if (!response.ok) throw new Error(data.help || data.error || "National Rail times could not be loaded.");
  return data.arrivals || [];
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

    const encrypted = await encryptPushPayload(subscription, JSON.stringify(payload));
    const jwt = await createVapidJwt(subscription.endpoint, env);
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: `WebPush ${jwt}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Crypto-Key": `p256ecdsa=${env.VAPID_PUBLIC_KEY}`,
        TTL: String(DEFAULT_TTL_SECONDS),
      },
      body: encrypted,
    });

    return {
      ok: response.status >= 200 && response.status < 300,
      gone: response.status === 404 || response.status === 410,
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
  const origin = new URL(endpoint).origin;
  const header = base64UrlEncode(textBytes(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = base64UrlEncode(textBytes(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || "mailto:admin@example.com",
  })));
  const token = `${header}.${body}`;
  const key = await importVapidPrivateKey(env);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textBytes(token)));
  return `${token}.${base64UrlEncode(normaliseEcdsaSignature(signature))}`;
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
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function isAllowedPushHost(hostname) {
  if (ALLOWED_PUSH_HOSTS.has(hostname)) return true;
  return hostname.endsWith(".push.apple.com") || hostname.endsWith(".notify.windows.com");
}

function isBase64UrlToken(value, minLength, maxLength) {
  return value.length >= minLength && value.length <= maxLength && /^[a-zA-Z0-9_-]+$/.test(value);
}

function normaliseTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone });
    return timeZone;
  } catch {
    return LONDON_TIME_ZONE;
  }
}

function getScheduleKey(endpointHash, scheduleId) {
  return `${SCHEDULE_PREFIX}${endpointHash}:${normaliseScheduleId(scheduleId)}`;
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatEta(seconds) {
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
