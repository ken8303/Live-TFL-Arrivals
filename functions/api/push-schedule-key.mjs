const SCHEDULE_PREFIX = "schedule:";
const SCHEDULE_CATCHUP_MINUTES = 8;
const LONDON_TIME_ZONE = "Europe/London";

export function getScheduleKey(endpointHash, schedule, timeZone = LONDON_TIME_ZONE) {
  return [
    SCHEDULE_PREFIX.slice(0, -1),
    endpointHash,
    normaliseScheduleId(schedule.id),
    String(schedule.time || "").replace(":", ""),
    getWeekdayMask(schedule.weekdays),
    encodeTimeZone(normaliseTimeZone(timeZone)),
  ].join(":");
}

export function parseScheduleKey(key) {
  const parts = String(key || "").split(":");
  if (![5, 6].includes(parts.length) || `${parts[0]}:` !== SCHEDULE_PREFIX) return null;
  const [, endpointHash, scheduleId, timeKey, weekdayMaskText, timeZoneKey] = parts;
  if (!endpointHash || !scheduleId || !/^\d{4}$/.test(timeKey)) return null;
  const weekdayMask = Number.parseInt(weekdayMaskText, 10);
  if (!Number.isFinite(weekdayMask) || weekdayMask <= 0 || weekdayMask > 127) return null;
  const time = `${timeKey.slice(0, 2)}:${timeKey.slice(2)}`;
  if (!isValidTime(time)) return null;
  const timeZone = timeZoneKey ? decodeTimeZone(timeZoneKey) : LONDON_TIME_ZONE;
  if (!timeZone) return null;
  return { endpointHash, scheduleId, time, weekdayMask, timeZone };
}

export function getDueMinuteKeyFromScheduleKey(key, now = new Date()) {
  const parsed = parseScheduleKey(key);
  if (!parsed) return "";
  return getDueMinuteKeyForTime(parsed.time, parsed.weekdayMask, parsed.timeZone, now);
}

export function getDueMinuteKeyForTime(time, weekdayMask, timeZone, now = new Date()) {
  const parts = getTimeZoneParts(now, timeZone);
  if (!parts || !isValidTime(time) || !weekdayMask) return "";
  const currentMinutes = Number(parts.hour) * 60 + Number(parts.minute);
  const [scheduleHour, scheduleMinute] = time.split(":").map(Number);
  const scheduleMinutes = scheduleHour * 60 + scheduleMinute;
  if ((weekdayMask & (1 << parts.weekday)) && currentMinutes >= scheduleMinutes && currentMinutes <= scheduleMinutes + SCHEDULE_CATCHUP_MINUTES) {
    return `${parts.year}-${parts.month}-${parts.day}T${time}`;
  }

  const previousParts = getTimeZoneParts(new Date(now.getTime() - 24 * 60 * 60_000), timeZone);
  if (!previousParts || !(weekdayMask & (1 << previousParts.weekday))) return "";
  const minutesAfterPreviousDaySchedule = currentMinutes + 24 * 60 - scheduleMinutes;
  if (minutesAfterPreviousDaySchedule < 0 || minutesAfterPreviousDaySchedule > SCHEDULE_CATCHUP_MINUTES) return "";

  return `${previousParts.year}-${previousParts.month}-${previousParts.day}T${time}`;
}

export function normaliseTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone }).format();
    return timeZone;
  } catch {
    return LONDON_TIME_ZONE;
  }
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

function normaliseScheduleId(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function getWeekdayMask(weekdays) {
  return (Array.isArray(weekdays) ? weekdays : [])
    .map((day) => Number.parseInt(day, 10))
    .filter((day) => day >= 0 && day <= 6)
    .reduce((mask, day) => mask | (1 << day), 0);
}

function isValidTime(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value))) return false;
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 && minutes % 5 === 0;
}

function encodeTimeZone(timeZone) {
  return base64UrlEncode(new TextEncoder().encode(timeZone));
}

function decodeTimeZone(value) {
  try {
    const decoded = new TextDecoder().decode(base64UrlToUint8Array(value));
    new Intl.DateTimeFormat("en-GB", { timeZone: decoded }).format();
    return decoded;
  } catch {
    return "";
  }
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
