const API_BASE = "https://api.tfl.gov.uk";
const DEMO_LOCATION = { lat: 51.5074, lon: -0.1278, label: "central London" };
const MAX_BUS_STOPS = 3;
const MAX_STATIONS = 2;
const MAX_ARRIVALS = 3;
const CANDIDATE_BUS_STOPS = 10;
const CANDIDATE_STATIONS = 8;
const STATION_MODES = new Set(["tube", "dlr", "overground", "elizabeth-line", "national-rail", "tram"]);
const AUTO_REFRESH_SECONDS = 30;

const state = {
  lastLocation: null,
  loading: false,
  pendingReload: false,
  nextRefreshAt: null,
  autoRefreshTimer: null,
};

const stopGrid = document.querySelector("#stopGrid");
const stationGrid = document.querySelector("#stationGrid");
const busSection = document.querySelector('[aria-label="Nearest bus stops"]');
const trainSection = document.querySelector('[aria-label="Nearest train stations"]');
const stopTemplate = document.querySelector("#stopTemplate");
const statusText = document.querySelector("#statusText");
const statusDot = document.querySelector("#statusDot");
const lastUpdated = document.querySelector("#lastUpdated");
const refreshCountdown = document.querySelector("#refreshCountdown");
const locateButton = document.querySelector("#locateButton");
const demoButton = document.querySelector("#demoButton");
const refreshButton = document.querySelector("#refreshButton");
const manualForm = document.querySelector("#manualForm");
const latInput = document.querySelector("#latInput");
const lonInput = document.querySelector("#lonInput");
const busSelect = document.querySelector("#busSelect");
const trainSelect = document.querySelector("#trainSelect");

locateButton.addEventListener("click", locateUser);
demoButton.addEventListener("click", () => loadNearby(DEMO_LOCATION));
refreshButton.addEventListener("click", () => {
  if (state.lastLocation) {
    loadNearby(state.lastLocation);
  } else {
    setStatus("Choose a location before refreshing.", "waiting");
  }
});

manualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const lat = Number.parseFloat(latInput.value.trim());
  const lon = Number.parseFloat(lonInput.value.trim());

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    setStatus("Enter a valid latitude and longitude.", "error");
    return;
  }

  loadNearby({ lat, lon, label: "manual location" });
});

busSelect.addEventListener("change", handleDisplayChange);
trainSelect.addEventListener("change", handleDisplayChange);
startAutoRefresh();

function locateUser() {
  if (!navigator.geolocation) {
    setStatus("This browser cannot share location. Enter coordinates or try central London.", "error");
    return;
  }

  setStatus("Finding your location...", "waiting");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude: lat, longitude: lon } = position.coords;
      latInput.value = lat.toFixed(5);
      lonInput.value = lon.toFixed(5);
      loadNearby({ lat, lon, label: "your location" });
    },
    () => {
      setStatus("Location was blocked. Enter coordinates or try central London.", "error");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 10_000,
    },
  );
}

async function loadNearby(location) {
  if (state.loading) {
    state.lastLocation = location;
    state.pendingReload = true;
    return;
  }

  const options = getDisplayOptions();
  updateSectionVisibility(options);

  if (!options.showBus && !options.showTrain) {
    state.lastLocation = location;
    stopGrid.innerHTML = "";
    stationGrid.innerHTML = "";
    setStatus("Turn on buses or trains to display live arrivals.", "waiting");
    scheduleNextRefresh();
    return;
  }

  state.loading = true;
  state.lastLocation = location;
  setStatus(`Looking for ${formatSelectedModes(options)} near ${location.label}...`, "waiting");
  lastUpdated.textContent = "";
  if (options.showBus) {
    renderSkeletons(stopGrid, MAX_BUS_STOPS);
  } else {
    stopGrid.innerHTML = "";
  }
  if (options.showTrain) {
    renderSkeletons(stationGrid, MAX_STATIONS);
  } else {
    stationGrid.innerHTML = "";
  }

  try {
    const [stops, stations] = await Promise.all([
      options.showBus ? findClosestBusStops(location) : Promise.resolve([]),
      options.showTrain ? findClosestStations(location) : Promise.resolve([]),
    ]);

    if (!stops.length && !stations.length) {
      stopGrid.innerHTML = "";
      stationGrid.innerHTML = "";
      setStatus(`No TfL ${formatSelectedModes(options)} were found nearby. Try a London location.`, "error");
      return;
    }

    const candidatesWithArrivals = await Promise.all(
      stops.map(async (stop) => ({
        stop,
        arrivals: await getArrivals(stop.id || stop.naptanId, "bus"),
      })),
    );
    const liveStops = candidatesWithArrivals.filter(({ arrivals }) => arrivals.length > 0);
    const emptyStops = candidatesWithArrivals.filter(({ arrivals }) => arrivals.length === 0);
    const stopsWithArrivals = [...liveStops, ...emptyStops].slice(0, MAX_BUS_STOPS);

    const candidatesWithDepartures = await Promise.all(
      stations.map(async (stop) => ({
        stop,
        arrivals: await getArrivals(stop.id || stop.naptanId, "train"),
      })),
    );
    const liveStations = candidatesWithDepartures.filter(({ arrivals }) => arrivals.length > 0);
    const emptyStations = candidatesWithDepartures.filter(({ arrivals }) => arrivals.length === 0);
    const stationsWithDepartures = [...liveStations, ...emptyStations].slice(0, MAX_STATIONS);

    if (options.showBus) renderStops(stopsWithArrivals);
    if (options.showTrain) renderStations(stationsWithDepartures);
    setStatus(formatResultStatus(stopsWithArrivals.length, stationsWithDepartures.length, options), "ready");
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.error(error);
    stopGrid.innerHTML = "";
    stationGrid.innerHTML = "";
    setStatus("Live TfL data could not be loaded. Please try again in a moment.", "error");
  } finally {
    state.loading = false;
    if (state.pendingReload) {
      state.pendingReload = false;
      window.setTimeout(() => loadNearby(state.lastLocation), 0);
    } else {
      scheduleNextRefresh();
    }
  }
}

async function findClosestBusStops(location) {
  return findClosestPlaces({
    ...location,
    stopTypes: "NaptanPublicBusCoachTram",
    modes: "bus",
    targetCount: MAX_BUS_STOPS,
    candidateCount: CANDIDATE_BUS_STOPS,
  });
}

async function findClosestStations(location) {
  return findClosestPlaces({
    ...location,
    stopTypes: "NaptanMetroStation,NaptanRailStation",
    modes: "tube,dlr,overground,elizabeth-line,national-rail",
    targetCount: MAX_STATIONS,
    candidateCount: CANDIDATE_STATIONS,
  });
}

async function findClosestPlaces({ lat, lon, stopTypes, modes, targetCount, candidateCount }) {
  const radii = [500, 900, 1500];

  for (const radius of radii) {
    const url = new URL(`${API_BASE}/StopPoint`);
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("stopTypes", stopTypes);
    url.searchParams.set("modes", modes);
    url.searchParams.set("radius", radius);

    const data = await fetchJson(url);
    const stops = (data.stopPoints || [])
      .filter((stop) => stop.status !== false && (stop.id || stop.naptanId))
      .sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE));

    if (stops.length >= targetCount || radius === radii.at(-1)) {
      return stops.slice(0, candidateCount);
    }
  }

  return [];
}

async function getArrivals(stopId, type) {
  const arrivals = await fetchJson(`${API_BASE}/StopPoint/${encodeURIComponent(stopId)}/Arrivals`);

  return arrivals
    .filter((arrival) => (type === "bus" ? arrival.modeName === "bus" : STATION_MODES.has(arrival.modeName)))
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .slice(0, MAX_ARRIVALS);
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`TfL request failed with status ${response.status}`);
  }

  return response.json();
}

function renderStops(stopsWithArrivals) {
  stopGrid.innerHTML = "";

  stopsWithArrivals.forEach(({ stop, arrivals }) => {
    stopGrid.append(renderCard({ stop, arrivals, type: "bus" }));
  });
}

function renderStations(stationsWithDepartures) {
  stationGrid.innerHTML = "";

  stationsWithDepartures.forEach(({ stop, arrivals }) => {
    stationGrid.append(renderCard({ stop, arrivals, type: "train" }));
  });
}

function renderCard({ stop, arrivals, type }) {
  const node = stopTemplate.content.firstElementChild.cloneNode(true);
  const title = node.querySelector("h2");
  const meta = node.querySelector(".stop-meta");
  const letter = node.querySelector(".stop-letter");
  const list = node.querySelector(".arrival-list");
  const isTrain = type === "train";

  node.classList.toggle("station-card", isTrain);
  title.textContent = cleanStationName(stop.commonName || (isTrain ? "Unnamed station" : "Unnamed bus stop"));
  meta.textContent = isTrain ? `${formatDistance(stop.distance)} away${getLineSummary(stop)}` : `${formatDistance(stop.distance)} away${getTowards(stop)}`;
  letter.textContent = isTrain ? "Train" : stop.stopLetter || stop.indicator || "Bus";
  node.href = getMapUrl(stop);
  node.setAttribute("aria-label", `Open ${title.textContent} in Google Maps`);
  node.title = "Open in Google Maps";

  if (!arrivals.length) {
    list.innerHTML = `<li class="empty-state">No live ${isTrain ? "train departures" : "arrivals"} here right now.</li>`;
  } else {
    arrivals.forEach((arrival) => {
      const item = document.createElement("li");
      item.className = "arrival";
      item.innerHTML = `
        <span class="route">${escapeHtml(arrival.lineName || arrival.lineId || (isTrain ? "Train" : "Bus"))}</span>
        <span class="destination">
          <strong>${escapeHtml(cleanStationName(arrival.destinationName || "Destination unavailable"))}</strong>
          <span>${escapeHtml(formatExpectedTime(arrival.expectedArrival))}${formatPlatform(arrival.platformName)}</span>
        </span>
        <span class="eta">${formatEta(arrival.timeToStation)}</span>
      `;
      list.append(item);
    });
  }

  return node;
}

function renderSkeletons(grid, count) {
  grid.innerHTML = "";
  for (let index = 0; index < count; index += 1) {
    const node = document.createElement("article");
    node.className = "stop-card skeleton";
    grid.append(node);
  }
}

function setStatus(message, tone) {
  statusText.textContent = message;
  statusDot.className = "status-dot";
  if (tone === "ready") statusDot.classList.add("ready");
  if (tone === "error") statusDot.classList.add("error");
}

function handleDisplayChange() {
  const options = getDisplayOptions();
  updateSectionVisibility(options);

  if (state.lastLocation) {
    loadNearby(state.lastLocation);
  } else if (!options.showBus && !options.showTrain) {
    setStatus("Turn on buses or trains to display live arrivals.", "waiting");
  } else {
    setStatus(`Choose a location to see nearby ${formatSelectedModes(options)}.`, "waiting");
  }
}

function getDisplayOptions() {
  return {
    showBus: busSelect.value === "show",
    showTrain: trainSelect.value === "show",
  };
}

function updateSectionVisibility({ showBus, showTrain }) {
  busSection.hidden = !showBus;
  trainSection.hidden = !showTrain;
}

function formatSelectedModes({ showBus, showTrain }) {
  if (showBus && showTrain) return "buses and trains";
  if (showBus) return "buses";
  if (showTrain) return "trains";
  return "arrivals";
}

function formatResultStatus(busCount, trainCount, { showBus, showTrain }) {
  if (showBus && showTrain) return `Showing ${busCount} bus stops and ${trainCount} train stations.`;
  if (showBus) return `Showing ${busCount} bus stops.`;
  if (showTrain) return `Showing ${trainCount} train stations.`;
  return "No arrivals selected.";
}

function startAutoRefresh() {
  scheduleNextRefresh();
  state.autoRefreshTimer = window.setInterval(() => {
    if (state.nextRefreshAt && Date.now() >= state.nextRefreshAt && state.lastLocation && !state.loading) {
      loadNearby(state.lastLocation);
      return;
    }

    updateRefreshCountdown();
  }, 1000);
}

function scheduleNextRefresh() {
  state.nextRefreshAt = Date.now() + AUTO_REFRESH_SECONDS * 1000;
  updateRefreshCountdown();
}

function updateRefreshCountdown() {
  if (!state.lastLocation) {
    refreshCountdown.textContent = `Auto refresh every ${AUTO_REFRESH_SECONDS}s`;
    return;
  }

  const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  refreshCountdown.textContent = `Auto refresh in ${seconds}s`;
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) return "Nearby";
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1)} km`;
}

function getTowards(stop) {
  const towards = (stop.additionalProperties || []).find((item) => item.key === "Towards")?.value;
  return towards ? `, towards ${towards}` : "";
}

function getLineSummary(stop) {
  const lines = (stop.lines || []).map((line) => line.name).filter(Boolean).slice(0, 3);
  return lines.length ? `, ${lines.join(", ")}` : "";
}

function formatPlatform(platformName) {
  return platformName ? `, ${escapeHtml(platformName)}` : "";
}

function getMapUrl(stop) {
  const name = cleanStationName(stop.commonName || "Transit stop");
  const hasCoordinates = Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && stop.lat !== 0 && stop.lon !== 0;
  const query = hasCoordinates ? `${stop.lat},${stop.lon}` : name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function cleanStationName(name) {
  return String(name)
    .replace(/\s+Underground Station$/i, "")
    .replace(/\s+Rail Station$/i, "")
    .replace(/\s+Station$/i, "");
}

function formatEta(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  const minutes = Math.max(0, Math.round(seconds / 60));
  return minutes <= 1 ? "Due" : `${minutes}m`;
}

function formatExpectedTime(value) {
  if (!value) return "Expected time unavailable";
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
