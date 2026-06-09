const DAY_MS = 24 * 60 * 60 * 1000;
const TFL_API_BASE = "https://api.tfl.gov.uk";
const READING_API_BASE = "https://reading-opendata.r2p.com/api/v1";
const PAGE_LIMIT = 1000;
const MAX_PAGES = 120;

const busCache = { updatedAt: 0, items: null, pending: null };
const readingBusCache = { updatedAt: 0, items: null, pending: null };
const trainCache = { updatedAt: 0, items: null, pending: null };

export async function getCachedBusStops(env = {}) {
  return getCachedCatalog(busCache, () => fetchBusStops(env));
}

export async function getCachedTrainStations(env = {}) {
  return getCachedCatalog(trainCache, () => fetchTrainStations(env));
}

export async function getCachedReadingBusStops(env = {}) {
  return getCachedCatalog(readingBusCache, () => fetchReadingBusStops(env));
}

async function getCachedCatalog(cache, load) {
  const now = Date.now();
  if (cache.items && now - cache.updatedAt < DAY_MS) {
    return { updatedAt: new Date(cache.updatedAt).toISOString(), items: cache.items };
  }

  if (!cache.pending) {
    cache.pending = load()
      .then((items) => {
        cache.items = items;
        cache.updatedAt = Date.now();
        return { updatedAt: new Date(cache.updatedAt).toISOString(), items };
      })
      .finally(() => {
        cache.pending = null;
      });
  }

  return cache.pending;
}

async function fetchBusStops(env) {
  const stopPoints = await fetchStopPointsByModes("bus", env);
  return dedupeById(stopPoints)
    .map(normaliseBusStop)
    .sort((a, b) => a.commonName.localeCompare(b.commonName) || (a.stopLetter || "").localeCompare(b.stopLetter || ""));
}

async function fetchTrainStations(env) {
  const stopPoints = await fetchStopPointsByModes("tube,dlr,overground,elizabeth-line,national-rail,tram", env);
  return dedupeById(stopPoints)
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .map(normaliseTrainStation)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchReadingBusStops(env) {
  if (!env.READING_OPEN_DATA_API_TOKEN) {
    throw new Error("Add READING_OPEN_DATA_API_TOKEN to load Reading bus stops.");
  }

  const url = new URL(`${READING_API_BASE}/busstops`);
  url.searchParams.set("api_token", env.READING_OPEN_DATA_API_TOKEN);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reading bus stop request failed with status ${response.status}.`);
  }

  const data = await response.json();
  const items = Array.isArray(data) ? data : data.data || data.busstops || data.busStops || [];

  return dedupeById(items)
    .map(normaliseReadingBusStop)
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .sort((a, b) => a.commonName.localeCompare(b.commonName) || (a.stopLetter || "").localeCompare(b.stopLetter || ""));
}

async function fetchStopPointsByModes(modes, env) {
  const items = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(`${TFL_API_BASE}/StopPoint/Mode/${encodeURIComponent(modes)}`);
    url.searchParams.set("page", String(page));
    if (env.TFL_APP_KEY) url.searchParams.set("app_key", env.TFL_APP_KEY);
    if (env.TFL_APP_ID) url.searchParams.set("app_id", env.TFL_APP_ID);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TfL stop-point catalog request failed with status ${response.status}. Add TFL_APP_KEY for bulk catalog access if needed.`);
    }

    const data = await response.json();
    const stopPoints = data.stopPoints || [];
    items.push(...stopPoints);

    if (!stopPoints.length || stopPoints.length < PAGE_LIMIT) break;
  }

  return items;
}

function dedupeById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = item?.id || item?.naptanId;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function normaliseBusStop(stop) {
  return {
    id: stop.id,
    naptanId: stop.naptanId || stop.id,
    commonName: stop.commonName || stop.name || "Unnamed bus stop",
    stopLetter: stop.stopLetter || "",
    indicator: stop.indicator || "",
    lat: stop.lat,
    lon: stop.lon,
    additionalProperties: stop.additionalProperties || [],
    provider: "tfl",
  };
}

function normaliseTrainStation(stop) {
  const crs = getAdditionalProperty(stop, "CrsCode") || getAdditionalProperty(stop, "CRS");
  return {
    id: stop.id,
    naptanId: stop.naptanId || stop.id,
    name: cleanStationName(stop.commonName || stop.name || "Unnamed station"),
    commonName: stop.commonName || stop.name || "Unnamed station",
    lat: stop.lat,
    lon: stop.lon,
    crs,
    additionalProperties: stop.additionalProperties || [],
    lines: (stop.lines || []).map((line) => ({
      id: line.id,
      name: line.name,
    })),
  };
}

function normaliseReadingBusStop(stop) {
  return {
    id: String(
      stop.id ||
        stop.stop_id ||
        stop.stopId ||
        stop.atco_code ||
        stop.atcoCode ||
        stop.smscode ||
        stop.smsCode ||
        stop.code ||
        "",
    ),
    naptanId: String(
      stop.naptanId ||
        stop.naptan_id ||
        stop.atco_code ||
        stop.atcoCode ||
        stop.stop_id ||
        stop.stopId ||
        stop.id ||
        "",
    ),
    commonName:
      stop.commonName ||
      stop.common_name ||
      stop.name ||
      stop.stop_name ||
      stop.stopName ||
      "Unnamed Reading bus stop",
    stopLetter: stop.stopLetter || stop.stop_letter || stop.indicator || "",
    indicator: stop.indicator || stop.towards || "",
    lat: toNumber(stop.lat ?? stop.latitude),
    lon: toNumber(stop.lon ?? stop.lng ?? stop.longitude),
    additionalProperties: Object.entries(stop || {}).map(([key, value]) => ({
      key,
      value: value == null ? "" : String(value),
    })),
    provider: "reading-buses",
  };
}

function getAdditionalProperty(stop, key) {
  return (stop.additionalProperties || []).find((item) => item.key === key)?.value || "";
}

function cleanStationName(name) {
  return String(name)
    .replace(/\s+Underground Station$/i, "")
    .replace(/\s+Rail Station$/i, "")
    .replace(/\s+Station$/i, "");
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
