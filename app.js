const API_BASE = "https://api.tfl.gov.uk";
const DEFAULT_LIVE_BUS_STOPS = 3;
const DEFAULT_LIVE_TRAIN_STATIONS = 3;
const MAX_LIVE_DISPLAY_COUNT = 5;
const MAX_ARRIVALS = 3;
const CANDIDATE_BUS_STOPS = 10;
const CANDIDATE_STATIONS = 8;
const STATION_MODES = new Set(["tube", "dlr", "overground", "elizabeth-line", "national-rail", "tram"]);
const AUTO_REFRESH_SECONDS = 60;
const SELECTED_STOP_ARRIVALS = 5;
const SELECTED_STOP_CANDIDATES = 30;
const SELECTED_TRAIN_ARRIVALS = 5;
const NATIONAL_RAIL_RESULTS = 10;
const DEFAULT_LIVE_DELAY_MINUTES = 0;
const DEFAULT_DELAY_MINUTES = 10;
const MIN_DELAY_MINUTES = 0;
const MAX_DELAY_MINUTES = 60;
const AREAS = [
  { label: "Central London", lat: 51.5074, lon: -0.1278 },
  { label: "King's Cross", lat: 51.5308, lon: -0.1238 },
  { label: "Victoria", lat: 51.4965, lon: -0.1447 },
  { label: "Paddington", lat: 51.5154, lon: -0.1755 },
  { label: "Stratford", lat: 51.5413, lon: -0.0032 },
  { label: "Canary Wharf", lat: 51.5054, lon: -0.0235 },
  { label: "Brixton", lat: 51.4626, lon: -0.1149 },
  { label: "Camden Town", lat: 51.539, lon: -0.1426 },
  { label: "Shoreditch", lat: 51.5235, lon: -0.0754 },
  { label: "Hammersmith", lat: 51.4927, lon: -0.2259 },
];
const TRAIN_STATIONS = [
  {
    name: "Charing Cross",
    id: "940GZZLUCHX",
    crs: "CHX",
    lat: 51.50741,
    lon: -0.127277,
    lines: [{ id: "national-rail", name: "National Rail" }],
  },
  {
    name: "King's Cross St. Pancras",
    id: "940GZZLUKSX",
    crs: "KGX",
    lat: 51.530663,
    lon: -0.123194,
    lines: [{ id: "national-rail", name: "National Rail" }],
  },
  {
    name: "Victoria",
    id: "940GZZLUVIC",
    crs: "VIC",
    lat: 51.496424,
    lon: -0.143921,
    lines: [{ id: "national-rail", name: "National Rail" }],
  },
  { name: "Paddington Underground", id: "940GZZLUPAC", lat: 51.515184, lon: -0.175539 },
  {
    name: "Paddington Rail",
    id: "910GPADTON",
    crs: "PAD",
    lat: 51.51603,
    lon: -0.17619,
    lines: [
      { id: "national-rail", name: "National Rail" },
      { id: "elizabeth", name: "Elizabeth line" },
    ],
  },
  {
    name: "Tottenham Court Road Elizabeth line",
    id: "910GTOTCTRD",
    lat: 51.515698,
    lon: -0.13044,
    lines: [{ id: "elizabeth", name: "Elizabeth line" }],
  },
  {
    name: "Stratford Elizabeth line",
    id: "910GSTFD",
    crs: "SRA",
    lat: 51.541893,
    lon: -0.003379,
    lines: [{ id: "elizabeth", name: "Elizabeth line" }],
  },
];

const state = {
  activePage: "live",
  lastLocation: null,
  liveMapPoints: [],
  selectedLivePointId: null,
  loading: false,
  pendingReload: false,
  selectedAreaStops: [],
  selectedStop: null,
  selectedSearchQuery: null,
  selectedTrainStation: null,
  selectedTrainLine: null,
  savedStopId: null,
  savedTrainLine: null,
  delayMinutes: DEFAULT_LIVE_DELAY_MINUTES,
  autoRefreshEnabled: false,
  nextRefreshAt: null,
  autoRefreshTimer: null,
};

const livePage = document.querySelector("#livePage");
const selectPage = document.querySelector("#selectPage");
const selectTrainPage = document.querySelector("#selectTrainPage");
const liveNavButton = document.querySelector("#liveNavButton");
const selectNavButton = document.querySelector("#selectNavButton");
const selectTrainNavButton = document.querySelector("#selectTrainNavButton");
const stopGrid = document.querySelector("#stopGrid");
const stationGrid = document.querySelector("#stationGrid");
const busSection = document.querySelector('[aria-label="Nearest bus stops"]');
const trainSection = document.querySelector('[aria-label="Nearest train stations"]');
const selectedStopPanel = document.querySelector("#selectedStopPanel");
const selectedStopTitle = document.querySelector("#selectedStopTitle");
const selectedTrainPanel = document.querySelector("#selectedTrainPanel");
const selectedTrainTitle = document.querySelector("#selectedTrainTitle");
const selectedTrainSubtitle = document.querySelector("#selectedTrainSubtitle");
const lineStatusPanel = document.querySelector("#lineStatusPanel");
const stopTemplate = document.querySelector("#stopTemplate");
const statusText = document.querySelector("#statusText");
const statusDot = document.querySelector("#statusDot");
const lastUpdated = document.querySelector("#lastUpdated");
const refreshCountdown = document.querySelector("#refreshCountdown");
const locateButton = document.querySelector("#locateButton");
const refreshButton = document.querySelector("#refreshButton");
const manualForm = document.querySelector("#manualForm");
const locationInput = document.querySelector("#locationInput");
const busSelect = document.querySelector("#busSelect");
const trainSelect = document.querySelector("#trainSelect");
const liveDelaySelect = document.querySelector("#liveDelaySelect");
const liveRefreshSelect = document.querySelector("#liveRefreshSelect");
const liveMapPreview = document.querySelector("#liveMapPreview");
const liveMapFrame = document.querySelector("#liveMapFrame");
const liveMapLegend = document.querySelector("#liveMapLegend");
const mapPreviewText = document.querySelector("#mapPreviewText");
const areaSelect = document.querySelector("#areaSelect");
const selectedStopSelect = document.querySelector("#selectedStopSelect");
const busStopSearchForm = document.querySelector("#busStopSearchForm");
const busStopSearchInput = document.querySelector("#busStopSearchInput");
const busDelaySelect = document.querySelector("#busDelaySelect");
const busRefreshSelect = document.querySelector("#busRefreshSelect");
const trainStationSelect = document.querySelector("#trainStationSelect");
const trainLineSelect = document.querySelector("#trainLineSelect");
const trainDelaySelect = document.querySelector("#trainDelaySelect");
const trainRefreshSelect = document.querySelector("#trainRefreshSelect");

locateButton.addEventListener("click", locateUser);
refreshButton.addEventListener("click", () => {
  if (!refreshActivePage()) {
    setStatus("Choose a location before refreshing.", "waiting");
  }
});

manualForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = locationInput.value.trim();

  if (!query) {
    setStatus("Enter a location to search.", "error");
    return;
  }

  searchLiveLocation(query);
});

busSelect.addEventListener("change", handleDisplayChange);
trainSelect.addEventListener("change", handleDisplayChange);
liveDelaySelect.addEventListener("change", handleDelayChange);
busDelaySelect.addEventListener("change", handleDelayChange);
trainDelaySelect.addEventListener("change", handleDelayChange);
liveRefreshSelect.addEventListener("change", handleRefreshToggle);
busRefreshSelect.addEventListener("change", handleRefreshToggle);
trainRefreshSelect.addEventListener("change", handleRefreshToggle);
stopGrid.addEventListener("click", handleLiveCardClick);
stationGrid.addEventListener("click", handleLiveCardClick);
liveMapLegend.addEventListener("click", handleLiveMapLegendClick);
liveNavButton.addEventListener("click", () => showPage("live"));
selectNavButton.addEventListener("click", () => showPage("select"));
selectTrainNavButton.addEventListener("click", () => showPage("train"));
areaSelect.addEventListener("change", () => loadSelectedAreaStops());
busStopSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = busStopSearchInput.value.trim();
  if (query) loadSearchedBusStops(query);
});
selectedStopSelect.addEventListener("change", () => {
  const stop = state.selectedAreaStops.find((item) => getStopId(item) === selectedStopSelect.value);
  if (stop) loadSelectedStopArrivals(stop);
});
trainStationSelect.addEventListener("change", () => loadSelectedTrainStation());
trainLineSelect.addEventListener("change", () => {
  const station = getSelectedTrainStation();
  if (station && trainLineSelect.value) loadSelectedTrainLine(station, trainLineSelect.value);
});
populateAreas();
populateTrainStations();
populateDelaySelects();
restoreFromUrl();
startAutoRefresh();
registerServiceWorker();

function locateUser() {
  if (!navigator.geolocation) {
    setStatus("This browser cannot share location. Enter coordinates or try central London.", "error");
    return;
  }

  setStatus("Finding your location...", "waiting");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude: lat, longitude: lon } = position.coords;
      locationInput.value = "Your location";
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
    updateLiveMap(location);
    stopGrid.innerHTML = "";
    stationGrid.innerHTML = "";
    setStatus("Choose at least 1 bus stop or 1 train station to display live arrivals.", "waiting");
    updateBookmarkUrl();
    scheduleNextRefresh();
    return;
  }

  state.loading = true;
  state.lastLocation = location;
  if (locationInput && location.label) locationInput.value = location.label;
  updateBookmarkUrl();
  updateLiveMap(location);
  setStatus(`Looking for ${formatSelectedModes(options)} near ${location.label}...`, "waiting");
  lastUpdated.textContent = "";
  if (options.showBus) {
    renderSkeletons(stopGrid, options.busCount);
  } else {
    stopGrid.innerHTML = "";
  }
  if (options.showTrain) {
    renderSkeletons(stationGrid, options.trainCount);
  } else {
    stationGrid.innerHTML = "";
  }

  try {
    const [stops, stations] = await Promise.all([
      options.showBus ? findClosestBusStops(location, options.busCount) : Promise.resolve([]),
      options.showTrain ? findClosestStations(location, options.trainCount) : Promise.resolve([]),
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
    const stopsWithArrivals = [...liveStops, ...emptyStops].slice(0, options.busCount);

    const candidatesWithDepartures = await Promise.all(
      stations.map(async (stop) => ({
        stop,
        arrivals: await getArrivals(stop.id || stop.naptanId, "train"),
      })),
    );
    const liveStations = candidatesWithDepartures.filter(({ arrivals }) => arrivals.length > 0);
    const emptyStations = candidatesWithDepartures.filter(({ arrivals }) => arrivals.length === 0);
    const stationsWithDepartures = [...liveStations, ...emptyStations].slice(0, options.trainCount);

    if (options.showBus) renderStops(stopsWithArrivals);
    if (options.showTrain) renderStations(stationsWithDepartures);
    updateLiveMap(location, buildLiveMapPoints(stopsWithArrivals, stationsWithDepartures, options));
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

async function loadSelectedAreaStops(preferredStopId = state.savedStopId) {
  const area = getSelectedArea();
  if (!area) return;

  state.loading = true;
  state.selectedStop = null;
  state.selectedSearchQuery = null;
  busStopSearchInput.value = "";
  state.selectedAreaStops = [];
  selectedStopSelect.disabled = true;
  selectedStopSelect.innerHTML = `<option>Loading bus stops...</option>`;
  selectedStopTitle.textContent = "Select a bus stop";
  selectedStopPanel.innerHTML = `<div class="empty-state">Loading bus stops in ${escapeHtml(area.label)}...</div>`;
  setStatus(`Loading bus stops in ${area.label}...`, "waiting");
  lastUpdated.textContent = "";
  updateBookmarkUrl();

  try {
    const stops = await findBusStopsForArea(area);
    state.selectedAreaStops = stops;

    if (!stops.length) {
      selectedStopSelect.innerHTML = `<option>No bus stops found</option>`;
      selectedStopPanel.innerHTML = `<div class="empty-state">No bus stops were found for this area.</div>`;
      setStatus(`No bus stops were found in ${area.label}.`, "error");
      return;
    }

    selectedStopSelect.innerHTML = stops
      .map((stop) => `<option value="${escapeHtml(getStopId(stop))}">${escapeHtml(formatStopOption(stop))}</option>`)
      .join("");
    selectedStopSelect.disabled = false;
    const preferredStop = preferredStopId ? stops.find((stop) => getStopId(stop) === preferredStopId) : null;
    const firstResult = preferredStop
      ? { stop: preferredStop, arrivals: await getArrivals(getStopId(preferredStop), "bus", SELECTED_STOP_ARRIVALS) }
      : await findFirstStopWithArrivals(stops);
    state.selectedStop = firstResult.stop;
    state.savedStopId = null;
    selectedStopSelect.value = getStopId(firstResult.stop);
    selectedStopTitle.textContent = cleanStationName(firstResult.stop.commonName || "Selected bus stop");
    renderSelectedStop(firstResult.stop, firstResult.arrivals);
    setSelectedStopStatus(firstResult.stop, firstResult.arrivals.length);
    updateBookmarkUrl();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.error(error);
    selectedStopSelect.innerHTML = `<option>Could not load stops</option>`;
    selectedStopPanel.innerHTML = `<div class="empty-state">Bus stops could not be loaded. Please try again.</div>`;
    setStatus("Bus stops could not be loaded. Please try again.", "error");
  } finally {
    state.loading = false;
    scheduleNextRefresh();
  }
}

async function loadSearchedBusStops(query, preferredStopId = state.savedStopId) {
  if (state.loading) {
    state.selectedSearchQuery = query;
    state.savedStopId = preferredStopId;
    state.pendingReload = true;
    return;
  }

  state.loading = true;
  state.selectedStop = null;
  state.selectedSearchQuery = query;
  state.selectedAreaStops = [];
  busStopSearchInput.value = query;
  selectedStopSelect.disabled = true;
  selectedStopSelect.innerHTML = `<option>Searching bus stops...</option>`;
  selectedStopTitle.textContent = "Search bus stops";
  selectedStopPanel.innerHTML = `<div class="empty-state">Searching bus stops for ${escapeHtml(query)}...</div>`;
  setStatus(`Searching bus stops for ${query}...`, "waiting");
  lastUpdated.textContent = "";
  updateBookmarkUrl();

  try {
    const stops = await searchBusStops(query);
    state.selectedAreaStops = stops;

    if (!stops.length) {
      selectedStopSelect.innerHTML = `<option>No bus stops found</option>`;
      selectedStopPanel.innerHTML = `<div class="empty-state">No bus stops matched this search.</div>`;
      setStatus(`No bus stops matched ${query}.`, "error");
      return;
    }

    selectedStopSelect.innerHTML = stops
      .map((stop) => `<option value="${escapeHtml(getStopId(stop))}">${escapeHtml(formatStopOption(stop))}</option>`)
      .join("");
    selectedStopSelect.disabled = false;
    const preferredStop = preferredStopId ? stops.find((stop) => getStopId(stop) === preferredStopId) : null;
    const firstResult = preferredStop
      ? { stop: preferredStop, arrivals: await getArrivals(getStopId(preferredStop), "bus", SELECTED_STOP_ARRIVALS) }
      : await findFirstStopWithArrivals(stops);
    state.selectedStop = firstResult.stop;
    state.savedStopId = null;
    selectedStopSelect.value = getStopId(firstResult.stop);
    selectedStopTitle.textContent = cleanStationName(firstResult.stop.commonName || "Selected bus stop");
    renderSelectedStop(firstResult.stop, firstResult.arrivals);
    setSelectedStopStatus(firstResult.stop, firstResult.arrivals.length);
    updateBookmarkUrl();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.error(error);
    selectedStopSelect.innerHTML = `<option>Search failed</option>`;
    selectedStopPanel.innerHTML = `<div class="empty-state">Search could not be loaded. Please try again.</div>`;
    setStatus("Bus stop search could not be loaded. Please try again.", "error");
  } finally {
    state.loading = false;
    scheduleNextRefresh();
  }
}

async function loadSelectedStopArrivals(stop) {
  if (state.loading) {
    state.selectedStop = stop;
    state.pendingReload = true;
    return;
  }

  state.loading = true;
  state.selectedStop = stop;
  updateBookmarkUrl();
  selectedStopTitle.textContent = cleanStationName(stop.commonName || "Selected bus stop");
  selectedStopPanel.innerHTML = "";
  renderSkeletons(selectedStopPanel, 1);
  setStatus(`Loading buses for ${cleanStationName(stop.commonName || "selected bus stop")}...`, "waiting");
  lastUpdated.textContent = "";

  try {
    const arrivals = await getArrivals(getStopId(stop), "bus", SELECTED_STOP_ARRIVALS);
    renderSelectedStop(stop, arrivals);
    setSelectedStopStatus(stop, arrivals.length);
    updateBookmarkUrl();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.error(error);
    selectedStopPanel.innerHTML = `<div class="empty-state">Live buses could not be loaded for this stop.</div>`;
    setStatus("Live buses could not be loaded for this stop.", "error");
  } finally {
    state.loading = false;
    if (state.pendingReload) {
      state.pendingReload = false;
      window.setTimeout(() => refreshActivePage(), 0);
    } else {
      scheduleNextRefresh();
    }
  }
}

async function loadSelectedTrainStation(preferredLine = state.savedTrainLine) {
  const station = getSelectedTrainStation();
  if (!station) return;

  state.loading = true;
  state.selectedTrainStation = station;
  state.selectedTrainLine = null;
  trainLineSelect.disabled = true;
  trainLineSelect.innerHTML = `<option>Loading train lines...</option>`;
  selectedTrainTitle.textContent = station.name;
  selectedTrainSubtitle.textContent = "Next 5 arrivals";
  lineStatusPanel.innerHTML = "";
  selectedTrainPanel.innerHTML = `<div class="empty-state">Loading train lines for ${escapeHtml(station.name)}...</div>`;
  setStatus(`Loading train lines for ${station.name}...`, "waiting");
  lastUpdated.textContent = "";
  updateBookmarkUrl();

  try {
    const arrivals = await getStationTrainArrivals(station.id);
    const lines = getArrivalLines(arrivals, station);

    if (!lines.length) {
      trainLineSelect.innerHTML = `<option>No live train lines found</option>`;
      selectedTrainPanel.innerHTML = `<div class="empty-state">No live train arrivals were found for this station right now.</div>`;
      setStatus(`No live train arrivals were found for ${station.name} right now.`, "waiting");
      return;
    }

    trainLineSelect.innerHTML = lines
      .map((line) => `<option value="${escapeHtml(line.id)}">${escapeHtml(line.name)}</option>`)
      .join("");
    trainLineSelect.disabled = false;
    state.loading = false;
    const lineId = lines.some((line) => line.id === preferredLine) ? preferredLine : lines[0].id;
    state.savedTrainLine = null;
    await loadSelectedTrainLine(station, lineId);
  } catch (error) {
    console.error(error);
    trainLineSelect.innerHTML = `<option>Could not load lines</option>`;
    selectedTrainPanel.innerHTML = `<div class="empty-state">Train lines could not be loaded. Please try again.</div>`;
    setStatus("Train lines could not be loaded. Please try again.", "error");
  } finally {
    state.loading = false;
    if (!state.selectedTrainLine) scheduleNextRefresh();
  }
}

async function loadSelectedTrainLine(station, lineId) {
  if (state.loading) {
    state.selectedTrainStation = station;
    state.selectedTrainLine = lineId;
    state.pendingReload = true;
    return;
  }

  state.loading = true;
  state.selectedTrainStation = station;
  state.selectedTrainLine = lineId;
  updateBookmarkUrl();
  trainLineSelect.value = lineId;
  selectedTrainTitle.textContent = station.name;
  selectedTrainSubtitle.textContent =
    lineId === "national-rail" && station.crs ? `Next ${NATIONAL_RAIL_RESULTS} departures` : `Next ${SELECTED_TRAIN_ARRIVALS} arrivals`;
  lineStatusPanel.innerHTML = `<div class="line-status loading">Loading line status...</div>`;
  selectedTrainPanel.innerHTML = "";
  renderSkeletons(selectedTrainPanel, 1);
  setStatus(`Loading ${formatTrainBoardName(lineId)} at ${station.name}...`, "waiting");
  lastUpdated.textContent = "";

  try {
    const [allArrivals, lineStatus] = await Promise.all([getTrainArrivalsForLine(station, lineId), getLineStatus(lineId)]);
    const limit = getTrainResultLimit(lineId, station);
    const arrivals =
      lineId === "national-rail" && station.crs
        ? allArrivals.slice(0, limit)
        : filterArrivalsByLine(allArrivals, lineId).slice(0, limit);
    renderLineStatus(lineStatus, lineId);
    renderSelectedTrainStation(station, arrivals, lineId);
    setTrainStationStatus(station, lineId, arrivals.length, lineStatus);
    updateBookmarkUrl();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.error(error);
    lineStatusPanel.innerHTML = "";
    const setupHint =
      lineId === "national-rail"
        ? " Check that your National Rail secret is set in Cloudflare Variables and Secrets."
        : "";
    selectedTrainPanel.innerHTML = `<div class="empty-state">Live train arrivals could not be loaded.${setupHint}</div>`;
    setStatus(`Live train arrivals could not be loaded.${setupHint}`, "error");
  } finally {
    state.loading = false;
    if (state.pendingReload) {
      state.pendingReload = false;
      window.setTimeout(() => refreshActivePage(), 0);
    } else {
      scheduleNextRefresh();
    }
  }
}

async function findClosestBusStops(location, targetCount) {
  return findClosestPlaces({
    ...location,
    stopTypes: "NaptanPublicBusCoachTram",
    modes: "bus",
    targetCount,
    candidateCount: CANDIDATE_BUS_STOPS,
  });
}

async function findBusStopsForArea(location) {
  return findClosestPlaces({
    ...location,
    stopTypes: "NaptanPublicBusCoachTram",
    modes: "bus",
    targetCount: 12,
    candidateCount: SELECTED_STOP_CANDIDATES,
  });
}

async function searchBusStops(query) {
  const postcodeLocation = await lookupPostcode(query);
  if (postcodeLocation) return findBusStopsForArea(postcodeLocation);

  const url = new URL(`${API_BASE}/StopPoint/Search/${encodeURIComponent(query)}`);
  url.searchParams.set("modes", "bus");
  const data = await fetchJson(url);

  return (data.matches || [])
    .filter((match) => (match.modes || []).includes("bus") && match.id && !match.id.startsWith("HUB"))
    .map((match) => ({
      id: match.id,
      naptanId: match.id,
      commonName: match.name,
      stopLetter: match.stopLetter || match.indicator || "",
      indicator: match.towards ? `to ${match.towards}` : match.indicator,
      distance: null,
      additionalProperties: match.towards
        ? [
            {
              key: "Towards",
              value: match.towards,
            },
          ]
        : [],
      lat: match.lat,
      lon: match.lon,
      lines: [],
    }))
    .slice(0, SELECTED_STOP_CANDIDATES);
}

async function lookupPostcode(query) {
  if (!/[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}/i.test(query)) return null;

  const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(query)}`);
  if (!response.ok) return null;
  const data = await response.json();
  const result = data.result;
  if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;

  return {
    label: result.postcode,
    lat: result.latitude,
    lon: result.longitude,
  };
}

async function searchLiveLocation(query) {
  setStatus(`Searching for ${query}...`, "waiting");
  try {
    const location = await lookupLocation(query);
    loadNearby(location);
  } catch (error) {
    console.error(error);
    setStatus("Location could not be found. Try a postcode, station, road, or place.", "error");
  }
}

async function lookupLocation(query) {
  const postcodeLocation = await lookupPostcode(query);
  if (postcodeLocation) return postcodeLocation;

  const stopSearchUrl = new URL(`${API_BASE}/StopPoint/Search/${encodeURIComponent(query)}`);
  const stopSearchData = await fetchJson(stopSearchUrl);
  const firstStopMatch = (stopSearchData.matches || []).find(
    (match) => Number.isFinite(match.lat) && Number.isFinite(match.lon),
  );

  if (firstStopMatch) {
    return {
      label: firstStopMatch.name || query,
      lat: firstStopMatch.lat,
      lon: firstStopMatch.lon,
    };
  }

  const placeSearchUrl = new URL(`${API_BASE}/Place/Search/${encodeURIComponent(query)}`);
  const placeSearchData = await fetchJson(placeSearchUrl);
  const firstPlaceMatch = (placeSearchData.matches || []).find(
    (match) => Number.isFinite(match.lat) && Number.isFinite(match.lon),
  );

  if (firstPlaceMatch) {
    return {
      label: firstPlaceMatch.name || query,
      lat: firstPlaceMatch.lat,
      lon: firstPlaceMatch.lon,
    };
  }

  throw new Error("Location not found");
}

async function findFirstStopWithArrivals(stops) {
  for (const stop of stops.slice(0, 10)) {
    const arrivals = await getArrivals(getStopId(stop), "bus", SELECTED_STOP_ARRIVALS);
    if (arrivals.length > 0) return { stop, arrivals };
  }

  return {
    stop: stops[0],
    arrivals: await getArrivals(getStopId(stops[0]), "bus", SELECTED_STOP_ARRIVALS),
  };
}

async function findClosestStations(location, targetCount) {
  return findClosestPlaces({
    ...location,
    stopTypes: "NaptanMetroStation,NaptanRailStation",
    modes: "tube,dlr,overground,elizabeth-line,national-rail",
    targetCount,
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

async function getArrivals(stopId, type, limit = MAX_ARRIVALS) {
  const arrivals = await fetchJson(`${API_BASE}/StopPoint/${encodeURIComponent(stopId)}/Arrivals`);

  return arrivals
    .filter((arrival) => (type === "bus" ? arrival.modeName === "bus" : STATION_MODES.has(arrival.modeName)))
    .sort((a, b) => a.timeToStation - b.timeToStation)
    .filter((arrival) => isAfterDelay(arrival.timeToStation))
    .slice(0, limit);
}

async function getStationTrainArrivals(stationId) {
  const arrivals = await fetchJson(`${API_BASE}/StopPoint/${encodeURIComponent(stationId)}/Arrivals`);

  return arrivals
    .filter((arrival) => STATION_MODES.has(arrival.modeName))
    .sort((a, b) => a.timeToStation - b.timeToStation);
}

async function getTrainArrivalsForLine(station, lineId) {
  if (lineId === "national-rail" && station.crs) {
    return getNationalRailArrivals(station.crs, NATIONAL_RAIL_RESULTS * 3);
  }

  return getStationTrainArrivals(station.id);
}

async function getNationalRailArrivals(crs, limit) {
  const data = await fetchJson(`/api/national-rail/arrivals?crs=${encodeURIComponent(crs)}&rows=${limit}`);
  return data.arrivals || [];
}

async function getLineStatus(lineId) {
  if (lineId === "national-rail") {
    return {
      name: "National Rail",
      lineStatuses: [
        {
          statusSeverityDescription: "Status varies by operator",
          reason: "TfL does not provide one combined live status for all National Rail services.",
        },
      ],
    };
  }

  const statuses = await fetchJson(`${API_BASE}/Line/${encodeURIComponent(lineId)}/Status`);
  return statuses[0] || null;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

function renderStops(stopsWithArrivals) {
  stopGrid.innerHTML = "";

  stopsWithArrivals.forEach(({ stop, arrivals }) => {
    stopGrid.append(renderCard({ stop, arrivals, type: "bus", origin: state.lastLocation, mapMode: "preview" }));
  });
}

function renderStations(stationsWithDepartures) {
  stationGrid.innerHTML = "";

  stationsWithDepartures.forEach(({ stop, arrivals }) => {
    stationGrid.append(renderCard({ stop, arrivals, type: "train", origin: state.lastLocation, mapMode: "preview" }));
  });
}

function renderSelectedStop(stop, arrivals) {
  selectedStopPanel.innerHTML = "";
  selectedStopPanel.append(renderCard({ stop, arrivals, type: "bus" }));
}

function renderSelectedTrainStation(station, arrivals, lineId) {
  selectedTrainPanel.innerHTML = "";
  selectedTrainPanel.append(
    renderCard({
      stop: {
        commonName: station.name,
        lat: station.lat,
        lon: station.lon,
        lines: [{ id: lineId, name: arrivals[0]?.lineName || formatLineName(lineId) }],
      },
      arrivals,
      type: "train",
      boardStation: station,
    }),
  );
}

function renderLineStatus(lineStatus, lineId) {
  const lineName = lineStatus?.name || formatLineName(lineId);
  const status = lineStatus?.lineStatuses?.[0];
  const statusTextValue = status?.statusSeverityDescription || "Status unavailable";
  const reason = status?.reason ? `<p>${escapeHtml(status.reason)}</p>` : "";
  const isGood = statusTextValue.toLowerCase() === "good service";

  lineStatusPanel.innerHTML = `
    <div class="line-status ${isGood ? "good" : "notice"}">
      <strong>${escapeHtml(lineName)}</strong>
      <span>${escapeHtml(statusTextValue)}</span>
      ${reason}
    </div>
  `;
}

function renderCard({ stop, arrivals, type, origin = null, boardStation = null, mapMode = "external" }) {
  const node = stopTemplate.content.firstElementChild.cloneNode(true);
  const title = node.querySelector("h2");
  const meta = node.querySelector(".stop-meta");
  const letter = node.querySelector(".stop-letter");
  const list = node.querySelector(".arrival-list");
  const isTrain = type === "train";
  const mapPointId = getLiveMapPointId(stop, type);

  node.classList.toggle("station-card", isTrain);
  title.textContent = cleanStationName(stop.commonName || (isTrain ? "Unnamed station" : "Unnamed bus stop"));
  meta.textContent = isTrain ? `${getTravelMeta(stop, origin)}${getLineSummary(stop)}` : `${getTravelMeta(stop, origin)}${getTowards(stop)}`;
  letter.textContent = isTrain ? "Train" : stop.stopLetter || stop.indicator || "Bus";
  if (mapMode === "preview") {
    node.href = "#liveMapPreview";
    node.dataset.mapMode = "preview";
    node.dataset.mapPointId = mapPointId;
    node.setAttribute("aria-label", `Show route to ${title.textContent} in map preview`);
    node.title = "Show route in map preview";
  } else {
    node.href = getMapUrl(stop);
    node.setAttribute("aria-label", `Open ${title.textContent} in Google Maps`);
    node.title = "Open in Google Maps";
  }

  if (!arrivals.length) {
    list.innerHTML = `<li class="empty-state">No live ${isTrain ? "train departures" : "arrivals"} here right now.</li>`;
  } else {
    arrivals.forEach((arrival) => {
      const item = document.createElement("li");
      item.className = "arrival";
      item.classList.toggle("national-rail-arrival", arrival.modeName === "national-rail");
      item.innerHTML = `
        <span class="route">${escapeHtml(arrival.lineName || arrival.lineId || (isTrain ? "Train" : "Bus"))}</span>
        <span class="destination">
          <strong>${escapeHtml(formatDestinationText(arrival, boardStation))}</strong>
          <span>${escapeHtml(formatJourneyDetail(arrival, boardStation))}</span>
          ${formatCallingPoints(arrival)}
        </span>
        <span class="eta-block">
          <span class="eta">${formatEta(arrival.timeToStation)}</span>
          ${formatPlatformDisplay(arrival)}
        </span>
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
  updateBookmarkUrl();

  if (state.lastLocation) {
    loadNearby(state.lastLocation);
  } else if (!options.showBus && !options.showTrain) {
    setStatus("Choose at least 1 bus stop or 1 train station to display live arrivals.", "waiting");
  } else {
    setStatus(`Choose a location to see nearby ${formatSelectedModes(options)}.`, "waiting");
  }
}

function handleDelayChange(event) {
  const minutes = clampDelayMinutes(Number.parseInt(event.target.value, 10));
  state.delayMinutes = minutes;
  syncDelaySelects();
  updateBookmarkUrl();

  if (refreshActivePage()) {
    return;
  }

  setStatus(`Showing schedules from the next ${minutes} minute${minutes === 1 ? "" : "s"}.`, "ready");
}

function handleRefreshToggle(event) {
  state.autoRefreshEnabled = event.target.value === "on";
  syncRefreshSelects();
  scheduleNextRefresh();
  updateBookmarkUrl();

  if (state.autoRefreshEnabled) {
    setStatus("Auto refresh is on. Schedules will refresh every 1 min.", "ready");
  } else {
    setStatus("Auto refresh is off.", "ready");
  }
}

function handleLiveCardClick(event) {
  const card = event.target.closest("[data-map-mode='preview'][data-map-point-id]");
  if (!card || !state.lastLocation) return;
  event.preventDefault();
  selectLiveMapPoint(card.dataset.mapPointId);
}

function handleLiveMapLegendClick(event) {
  const button = event.target.closest("[data-map-point-id]");
  if (!button || !state.lastLocation) return;
  event.preventDefault();
  selectLiveMapPoint(button.dataset.mapPointId);
}

function selectLiveMapPoint(pointId) {
  state.selectedLivePointId = pointId === "__overview__" ? null : pointId;
  updateLiveMap(state.lastLocation, state.liveMapPoints);
  liveMapPreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function showPage(page, options = {}) {
  const shouldLoad = options.load !== false;
  state.activePage = page;
  livePage.hidden = page !== "live";
  selectPage.hidden = page !== "select";
  selectTrainPage.hidden = page !== "train";
  liveNavButton.classList.toggle("active", page === "live");
  selectNavButton.classList.toggle("active", page === "select");
  selectTrainNavButton.classList.toggle("active", page === "train");
  liveNavButton.setAttribute("aria-pressed", String(page === "live"));
  selectNavButton.setAttribute("aria-pressed", String(page === "select"));
  selectTrainNavButton.setAttribute("aria-pressed", String(page === "train"));
  updateBookmarkUrl();

  if (page === "select" && shouldLoad && !state.selectedAreaStops.length) {
    loadSelectedAreaStops();
    return;
  }

  if (page === "train" && shouldLoad && !state.selectedTrainStation) {
    loadSelectedTrainStation();
    return;
  }

  if (page === "live") {
    if (state.lastLocation) {
      setStatus("Live nearby arrivals are ready.", "ready");
    } else {
      setStatus("Choose a location to see nearby buses and trains.", "waiting");
    }
  } else if (page === "select" && state.selectedStop) {
    setStatus(`Showing selected stop: ${cleanStationName(state.selectedStop.commonName || "bus stop")}.`, "ready");
  } else if (page === "train" && state.selectedTrainStation) {
    setStatus(`Showing selected station: ${state.selectedTrainStation.name}.`, "ready");
  }
}

function refreshActivePage() {
  if (state.activePage === "select") {
    if (state.selectedStop) {
      loadSelectedStopArrivals(state.selectedStop);
      return true;
    }
    if (state.selectedSearchQuery) {
      loadSearchedBusStops(state.selectedSearchQuery);
      return true;
    }
    loadSelectedAreaStops();
    return true;
  }

  if (state.activePage === "train") {
    if (state.selectedTrainStation && state.selectedTrainLine) {
      loadSelectedTrainLine(state.selectedTrainStation, state.selectedTrainLine);
      return true;
    }
    loadSelectedTrainStation();
    return true;
  }

  if (state.lastLocation) {
    loadNearby(state.lastLocation);
    return true;
  }

  return false;
}

function populateAreas() {
  areaSelect.innerHTML = AREAS.map((area, index) => `<option value="${index}">${escapeHtml(area.label)}</option>`).join("");
}

function populateTrainStations() {
  trainStationSelect.innerHTML = TRAIN_STATIONS.map(
    (station, index) => `<option value="${index}">${escapeHtml(station.name)}</option>`,
  ).join("");
}

function populateDelaySelects() {
  const options = Array.from({ length: MAX_DELAY_MINUTES - MIN_DELAY_MINUTES + 1 }, (_, index) => {
    const minutes = MIN_DELAY_MINUTES + index;
    return `<option value="${minutes}">${minutes} min</option>`;
  }).join("");

  [liveDelaySelect, busDelaySelect, trainDelaySelect].forEach((select) => {
    select.innerHTML = options;
  });
  syncDelaySelects();
}

function syncRefreshSelects() {
  const value = state.autoRefreshEnabled ? "on" : "off";
  [liveRefreshSelect, busRefreshSelect, trainRefreshSelect].forEach((select) => {
    select.value = value;
  });
}

function getSelectedArea() {
  return AREAS[Number.parseInt(areaSelect.value, 10)] || AREAS[0];
}

function getSelectedTrainStation() {
  return TRAIN_STATIONS[Number.parseInt(trainStationSelect.value, 10)] || TRAIN_STATIONS[0];
}

function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const page = ["live", "select", "train"].includes(params.get("page")) ? params.get("page") : "live";

  busSelect.value = String(parseLiveCountParam(params.get("bus"), DEFAULT_LIVE_BUS_STOPS));
  trainSelect.value = String(parseLiveCountParam(params.get("train"), DEFAULT_LIVE_TRAIN_STATIONS));
  const delayParam = params.get("delay");
  const defaultDelay = page === "live" ? DEFAULT_LIVE_DELAY_MINUTES : DEFAULT_DELAY_MINUTES;
  state.delayMinutes = clampDelayMinutes(delayParam === null ? defaultDelay : Number.parseInt(delayParam, 10));
  state.autoRefreshEnabled = params.get("refresh") === "on";
  syncDelaySelects();
  syncRefreshSelects();
  updateSectionVisibility(getDisplayOptions());

  showPage(page, { load: false });

  if (page === "select") {
    const areaIndex = Number.parseInt(params.get("area"), 10);
    if (Number.isInteger(areaIndex) && AREAS[areaIndex]) areaSelect.value = String(areaIndex);
    state.savedStopId = params.get("stop");
    if (params.get("q")) {
      loadSearchedBusStops(params.get("q"), state.savedStopId);
      return;
    }
    loadSelectedAreaStops(state.savedStopId);
    return;
  }

  if (page === "train") {
    const stationIndex = getTrainStationIndex(params.get("station"));
    if (stationIndex >= 0) trainStationSelect.value = String(stationIndex);
    state.savedTrainLine = params.get("line");
    loadSelectedTrainStation(state.savedTrainLine);
    return;
  }

  const lat = Number.parseFloat(params.get("lat"));
  const lon = Number.parseFloat(params.get("lon"));
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    locationInput.value = params.get("q") || params.get("label") || "bookmarked location";
    loadNearby({
      lat,
      lon,
      label: params.get("label") || "bookmarked location",
    });
  }
}

function updateBookmarkUrl() {
  const params = new URLSearchParams();
  params.set("page", state.activePage);

  if (state.activePage === "live") {
    params.set("bus", busSelect.value);
    params.set("train", trainSelect.value);
    params.set("delay", String(state.delayMinutes));
    params.set("refresh", state.autoRefreshEnabled ? "on" : "off");
    if (state.lastLocation) {
      params.set("lat", trimCoordinate(state.lastLocation.lat));
      params.set("lon", trimCoordinate(state.lastLocation.lon));
      params.set("label", state.lastLocation.label || "bookmarked location");
      params.set("q", locationInput.value || state.lastLocation.label || "");
    }
  }

  if (state.activePage === "select") {
    params.set("delay", String(state.delayMinutes));
    params.set("refresh", state.autoRefreshEnabled ? "on" : "off");
    if (state.selectedSearchQuery) {
      params.set("q", state.selectedSearchQuery);
    } else {
      params.set("area", areaSelect.value || "0");
    }
    if (state.selectedStop) params.set("stop", getStopId(state.selectedStop));
  }

  if (state.activePage === "train") {
    params.set("delay", String(state.delayMinutes));
    params.set("refresh", state.autoRefreshEnabled ? "on" : "off");
    const station = state.selectedTrainStation || getSelectedTrainStation();
    params.set("station", station.id);
    if (state.selectedTrainLine) params.set("line", state.selectedTrainLine);
  }

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function getTrainStationIndex(value) {
  if (!value) return -1;
  const asNumber = Number.parseInt(value, 10);
  if (Number.isInteger(asNumber) && TRAIN_STATIONS[asNumber]) return asNumber;
  return TRAIN_STATIONS.findIndex((station) => station.id === value);
}

function trimCoordinate(value) {
  return Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function getStopId(stop) {
  return stop.id || stop.naptanId;
}

function formatStopOption(stop) {
  const name = cleanStationName(stop.commonName || "Unnamed bus stop");
  const letter = stop.stopLetter || stop.indicator || "Bus";
  return `${name} ${letter} - ${formatDistance(stop.distance)}`;
}

function setSelectedStopStatus(stop, arrivalCount) {
  const stopName = cleanStationName(stop.commonName || "selected bus stop");
  if (arrivalCount > 0) {
    setStatus(`Showing next ${arrivalCount} buses for ${stopName}.`, "ready");
  } else {
    setStatus(`No live buses for ${stopName} right now.`, "waiting");
  }
}

function setTrainStationStatus(station, lineId, arrivalCount, lineStatus) {
  const lineName = lineStatus?.name || formatLineName(lineId);
  const boardType = lineId === "national-rail" && station.crs ? "departures" : "arrivals";
  if (arrivalCount > 0) {
    setStatus(`Showing next ${arrivalCount} ${lineName} ${boardType} at ${station.name}.`, "ready");
  } else {
    setStatus(`No live ${lineName} ${boardType} at ${station.name} right now.`, "waiting");
  }
}

function getArrivalLines(arrivals, station) {
  if ((station.lines || []).length) {
    return [...station.lines]
      .map((line) => ({
        id: line.id,
        name: line.name || formatLineName(line.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  const lineMap = new Map();
  arrivals.forEach((arrival) => {
    if (arrival.lineId && !lineMap.has(arrival.lineId)) {
      lineMap.set(arrival.lineId, {
        id: arrival.lineId,
        name: arrival.lineName || formatLineName(arrival.lineId),
      });
    }
  });
  return [...lineMap.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function filterArrivalsByLine(arrivals, lineId) {
  if (lineId === "national-rail") {
    return arrivals.filter((arrival) => arrival.modeName === "national-rail" && isAfterDelay(arrival.timeToStation));
  }

  return arrivals.filter((arrival) => arrival.lineId === lineId && isAfterDelay(arrival.timeToStation));
}

function formatLineName(lineId) {
  return lineId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTrainBoardName(lineId) {
  return lineId === "national-rail" ? "National Rail departures" : `${formatLineName(lineId)} arrivals`;
}

function getTrainResultLimit(lineId, station) {
  return lineId === "national-rail" && station.crs ? NATIONAL_RAIL_RESULTS : SELECTED_TRAIN_ARRIVALS;
}

function clampDelayMinutes(value) {
  if (!Number.isFinite(value)) return state.activePage === "live" ? DEFAULT_LIVE_DELAY_MINUTES : DEFAULT_DELAY_MINUTES;
  return Math.min(MAX_DELAY_MINUTES, Math.max(MIN_DELAY_MINUTES, value));
}

function syncDelaySelects() {
  const value = String(state.delayMinutes);
  [liveDelaySelect, busDelaySelect, trainDelaySelect].forEach((select) => {
    select.value = value;
  });
}

function isAfterDelay(timeToStation) {
  if (!Number.isFinite(timeToStation)) return true;
  return timeToStation >= state.delayMinutes * 60;
}

function getDisplayOptions() {
  const busCount = clampLiveDisplayCount(Number.parseInt(busSelect.value, 10), DEFAULT_LIVE_BUS_STOPS);
  const trainCount = clampLiveDisplayCount(Number.parseInt(trainSelect.value, 10), DEFAULT_LIVE_TRAIN_STATIONS);
  return {
    busCount,
    trainCount,
    showBus: busCount > 0,
    showTrain: trainCount > 0,
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

function clampLiveDisplayCount(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MAX_LIVE_DISPLAY_COUNT, Math.max(0, value));
}

function parseLiveCountParam(value, fallback) {
  if (value === "hide") return 0;
  if (value === "show") return fallback;
  return clampLiveDisplayCount(Number.parseInt(value, 10), fallback);
}

function updateLiveMap(location, points = []) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    liveMapFrame.removeAttribute("src");
    liveMapLegend.innerHTML = "";
    state.liveMapPoints = [];
    state.selectedLivePointId = null;
    mapPreviewText.textContent = "Choose a location to preview nearby stops and stations";
    return;
  }

  state.liveMapPoints = points;
  if (state.selectedLivePointId && !points.some((point) => point.id === state.selectedLivePointId)) {
    state.selectedLivePointId = null;
  }

  const selectedPoint = points.find((point) => point.id === state.selectedLivePointId) || null;
  mapPreviewText.textContent =
    selectedPoint
      ? `Showing route from ${location.label || "your search"} to ${selectedPoint.label}`
      : points.length > 0
      ? `Showing ${points.length} locations around ${location.label || "this area"}`
      : location.label
        ? `Centered on ${location.label}`
        : "Current search area";
  renderLiveMap(location, points, selectedPoint);
}

function buildLiveMapPoints(stopsWithArrivals, stationsWithDepartures, options) {
  const points = [];
  if (options.showBus) {
    stopsWithArrivals.forEach(({ stop }) => {
      const lat = Number(stop?.lat);
      const lon = Number(stop?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push({
          id: getLiveMapPointId(stop, "bus"),
          type: "bus",
          lat,
          lon,
          label: cleanStationName(stop.commonName || "Bus stop"),
          href: getMapUrl(stop),
        });
      }
    });
  }

  if (options.showTrain) {
    stationsWithDepartures.forEach(({ stop }) => {
      const lat = Number(stop?.lat);
      const lon = Number(stop?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        points.push({
          id: getLiveMapPointId(stop, "train"),
          type: "train",
          lat,
          lon,
          label: cleanStationName(stop.commonName || "Train station"),
          href: getMapUrl(stop),
        });
      }
    });
  }

  return points;
}

function renderLiveMap(location, points, selectedPoint = null) {
  liveMapFrame.src = buildGoogleMapEmbedUrl(location, selectedPoint ? [selectedPoint] : points);
  renderMapLegend(location, points, selectedPoint);
}

function renderMapLegend(location, points, selectedPoint = null) {
  const legendItems = [
    {
      id: "__overview__",
      type: "current",
      label: selectedPoint ? "Back to overview" : location.label || "Search area",
    },
    ...points,
  ];

  liveMapLegend.innerHTML = legendItems
    .map(
      (item) => `
        <button
          class="legend-pill${item.id === selectedPoint?.id || (item.id === "__overview__" && !selectedPoint) ? " active" : ""}"
          type="button"
          data-map-point-id="${escapeHtml(item.id)}"
        >
          <span class="legend-dot ${item.type}"></span>
          ${escapeHtml(item.label)}
        </button>
      `,
    )
    .join("");
}

function buildGoogleMapEmbedUrl(location, points) {
  const origin = `${Number(location.lat)},${Number(location.lon)}`;
  const destinations = points
    .map((point) => `${Number(point.lat)},${Number(point.lon)}`)
    .filter((value, index, items) => Number.isFinite(Number.parseFloat(value)) && items.indexOf(value) === index);

  if (!destinations.length) {
    return `https://www.google.com/maps?output=embed&q=${encodeURIComponent(origin)}`;
  }

  if (destinations.length === 1) {
    return `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destinations[0])}`;
  }

  const [firstDestination, ...rest] = destinations;
  const waypoints = rest.join("|");
  return `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(firstDestination)}&waypoints=${encodeURIComponent(waypoints)}`;
}

function startAutoRefresh() {
  scheduleNextRefresh();
  state.autoRefreshTimer = window.setInterval(() => {
    if (state.autoRefreshEnabled && state.nextRefreshAt && Date.now() >= state.nextRefreshAt && !state.loading) {
      if (!refreshActivePage()) scheduleNextRefresh();
      return;
    }

    updateRefreshCountdown();
  }, 1000);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service worker registration failed", error);
    });
  });
}

function scheduleNextRefresh() {
  if (!state.autoRefreshEnabled) {
    state.nextRefreshAt = null;
    updateRefreshCountdown();
    return;
  }
  state.nextRefreshAt = Date.now() + AUTO_REFRESH_SECONDS * 1000;
  updateRefreshCountdown();
}

function updateRefreshCountdown() {
  if (!state.autoRefreshEnabled) {
    refreshCountdown.textContent = "Auto refresh off";
    return;
  }

  if (!hasRefreshTarget()) {
    refreshCountdown.textContent = "Auto refresh on - every 1 min";
    return;
  }

  const seconds = Math.max(0, Math.ceil((state.nextRefreshAt - Date.now()) / 1000));
  refreshCountdown.textContent = `Auto refresh in ${seconds}s`;
}

function hasRefreshTarget() {
  if (state.activePage === "select") return Boolean(state.selectedStop);
  if (state.activePage === "train") return Boolean(state.selectedTrainStation && state.selectedTrainLine);
  return Boolean(state.lastLocation);
}

function formatDistance(distance) {
  if (!Number.isFinite(distance)) return "Nearby";
  if (distance < 1000) return `${Math.round(distance)} m`;
  return `${(distance / 1000).toFixed(1)} km`;
}

function getTravelMeta(stop, origin) {
  const distance = Number.isFinite(stop.distance) ? stop.distance : getDistanceMeters(origin, stop);
  const walkTime = formatWalkTime(distance);
  return `${formatDistance(distance)} away${walkTime ? `, ${walkTime} walk` : ""}`;
}

function getDistanceMeters(origin, stop) {
  const originLat = Number(origin?.lat);
  const originLon = Number(origin?.lon);
  const stopLat = Number(stop?.lat);
  const stopLon = Number(stop?.lon);
  if (![originLat, originLon, stopLat, stopLon].every(Number.isFinite)) return Number.NaN;

  const earthRadiusMeters = 6371e3;
  const originRadians = toRadians(originLat);
  const stopRadians = toRadians(stopLat);
  const latDelta = toRadians(stopLat - originLat);
  const lonDelta = toRadians(stopLon - originLon);
  const angle =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(originRadians) * Math.cos(stopRadians) * Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(angle), Math.sqrt(1 - angle));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function formatWalkTime(distance) {
  if (!Number.isFinite(distance)) return "";
  const walkingDistance = distance * 1.25;
  const minutes = Math.max(1, Math.round(walkingDistance / 80));
  return minutes === 1 ? "1 min" : `${minutes} min`;
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
  return platformName ? `, ${platformName}` : "";
}

function formatDestinationText(arrival, boardStation) {
  const destination = cleanStationName(arrival.destinationName || "Destination unavailable");
  return arrival.modeName === "national-rail" && boardStation ? `To ${destination}` : destination;
}

function formatJourneyDetail(arrival, boardStation) {
  const time = formatExpectedTime(arrival.expectedArrival);
  if (arrival.modeName === "national-rail" && boardStation) {
    return `Leaves ${boardStation.name} at ${time}`;
  }
  const platform = formatPlatform(arrival.platformName);
  return `${time}${platform}`;
}

function formatPlatformDisplay(arrival) {
  if (arrival.modeName !== "national-rail" || !arrival.platformName) return "";
  return `<span class="platform-detail">${escapeHtml(arrival.platformName)}</span>`;
}

function formatCallingPoints(arrival) {
  if (arrival.modeName !== "national-rail" || !(arrival.callingPoints || []).length) return "";
  return `<span>${escapeHtml(`Stops at ${formatCallingPointList(arrival.callingPoints)}`)}</span>`;
}

function formatCallingPointList(points) {
  const names = points.map((point) => cleanStationName(point)).filter(Boolean);
  if (names.length <= 4) return names.join(", ");
  return `${names.slice(0, 4).join(", ")} +${names.length - 4} more`;
}

function getMapUrl(stop) {
  const name = cleanStationName(stop.commonName || "Transit stop");
  const hasCoordinates = Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && stop.lat !== 0 && stop.lon !== 0;
  const query = hasCoordinates ? `${stop.lat},${stop.lon}` : name;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getLiveMapPointId(stop, type) {
  const stopId = getStopId(stop);
  if (stopId) return `${type}:${stopId}`;
  return `${type}:${Number(stop.lat).toFixed(5)},${Number(stop.lon).toFixed(5)}`;
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
