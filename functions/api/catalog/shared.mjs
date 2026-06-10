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

export async function getReadingBusStopsDebug(env = {}) {
  const payload = await fetchReadingBusStopPayload(env);
  const items = findReadingStopItems(payload);
  const normalised = items.map(normaliseReadingBusStop);
  return {
    payloadType: Array.isArray(payload) ? "array" : typeof payload,
    payloadKeys: payload && typeof payload === "object" && !Array.isArray(payload) ? Object.keys(payload).slice(0, 30) : [],
    rawCount: items.length,
    normalisedCount: normalised.length,
    validCount: normalised.filter((stop) => (stop.id || stop.naptanId) && Number.isFinite(stop.lat) && Number.isFinite(stop.lon)).length,
    sampleKeys: items.slice(0, 3).map((item) => item && typeof item === "object" ? Object.keys(item).slice(0, 30) : []),
    sampleNormalised: normalised.slice(0, 3),
  };
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
  const data = await fetchReadingBusStopPayload(env);
  const items = findReadingStopItems(data);

  return dedupeById(items.map(normaliseReadingBusStop))
    .filter((stop) => stop.id || stop.naptanId)
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .sort((a, b) => a.commonName.localeCompare(b.commonName) || (a.stopLetter || "").localeCompare(b.stopLetter || ""));
}

async function fetchReadingBusStopPayload(env) {
  if (!env.READING_OPEN_DATA_API_TOKEN) {
    throw new Error("Add READING_OPEN_DATA_API_TOKEN to load Reading bus stops.");
  }

  const url = new URL(`${READING_API_BASE}/busstops`);
  url.searchParams.set("api_token", env.READING_OPEN_DATA_API_TOKEN);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reading bus stop request failed with status ${response.status}.`);
  }

  return response.json();
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
  const coordinates = getReadingCoordinates(stop);
  const id =
    stop.id ||
    stop.stop_id ||
    stop.stopId ||
    stop.atco_code ||
    stop.atcoCode ||
    stop.ATCOCode ||
    stop.smscode ||
    stop.smsCode ||
    stop.sms_code ||
    stop.stop_code ||
    stop.stopCode ||
    stop.location ||
    stop.Location ||
    stop.location_code ||
    stop.locationCode ||
    stop.LocationCode ||
    stop.code ||
    stop.Code ||
    "";

  return {
    id: String(id),
    naptanId: String(
      stop.naptanId ||
        stop.naptan_id ||
        stop.atco_code ||
        stop.atcoCode ||
        stop.ATCOCode ||
        stop.atco ||
        stop.location_code ||
        stop.locationCode ||
        stop.LocationCode ||
        stop.stop_id ||
        stop.stopId ||
        stop.id ||
        id ||
        "",
    ),
    commonName:
      stop.commonName ||
      stop.common_name ||
      stop.name ||
      stop.stop_name ||
      stop.stopName ||
      stop.StopName ||
      stop.stopDescription ||
      stop.StopDescription ||
      stop.description ||
      stop.Description ||
      "Unnamed Reading bus stop",
    stopLetter: stop.stopLetter || stop.stop_letter || stop.bay_no || stop.bayNo || stop.indicator || "",
    indicator: stop.indicator || stop.towards || "",
    lat: toNumber(stop.lat ?? stop.latitude ?? stop.Latitude ?? stop.y ?? stop.Y ?? coordinates.lat),
    lon: toNumber(stop.lon ?? stop.lng ?? stop.longitude ?? stop.Longitude ?? stop.x ?? stop.X ?? coordinates.lon),
    additionalProperties: Object.entries(stop || {}).map(([key, value]) => ({
      key,
      value: value == null ? "" : String(value),
    })),
    provider: "reading-buses",
  };
}

function findReadingStopItems(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (looksLikeReadingStop(value)) return [value];

  const namedCollections = [
    value.data,
    value.busstops,
    value.busStops,
    value.bus_stops,
    value.stops,
    value.StopPoints,
    value.stopPoints,
    value.items,
    value.results,
    value.result,
  ];

  for (const collection of namedCollections) {
    const items = findReadingStopItems(collection);
    if (items.length) return items;
  }

  const values = Object.values(value);
  const stopValues = values.filter(looksLikeReadingStop);
  if (stopValues.length) return stopValues;

  return values.reduce((best, child) => {
    const items = findReadingStopItems(child);
    return items.length > best.length ? items : best;
  }, []);
}

function looksLikeReadingStop(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = new Set(Object.keys(value));
  const hasId = [
    "id",
    "stop_id",
    "stopId",
    "atco_code",
    "atcoCode",
    "ATCOCode",
    "smscode",
    "smsCode",
    "sms_code",
    "location",
    "Location",
    "locationCode",
    "LocationCode",
    "code",
    "Code",
  ].some((key) => keys.has(key));
  const hasName = [
    "commonName",
    "common_name",
    "name",
    "stop_name",
    "stopName",
    "StopName",
    "description",
    "Description",
  ].some((key) => keys.has(key));
  const coordinates = getReadingCoordinates(value);
  return hasId && (hasName || (Number.isFinite(coordinates.lat) && Number.isFinite(coordinates.lon)));
}

function getReadingCoordinates(stop) {
  const nested =
    stop.coordinates ||
    stop.Coordinates ||
    stop.coordinate ||
    stop.Coordinate ||
    stop.position ||
    stop.Position ||
    stop.locationPoint ||
    stop.LocationPoint ||
    {};
  return {
    lat: toNumber(nested.lat ?? nested.latitude ?? nested.Latitude ?? nested.y ?? nested.Y),
    lon: toNumber(nested.lon ?? nested.lng ?? nested.longitude ?? nested.Longitude ?? nested.x ?? nested.X),
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
