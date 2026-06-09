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
const SELECTED_STOP_FILTER_CANDIDATES = 30;
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
  selectedBusLocation: null,
  selectedStop: null,
  selectedStopArrivals: [],
  selectedBusRoute: "",
  selectedBusDestination: "",
  selectedSearchQuery: null,
  availableTrainStations: [...TRAIN_STATIONS],
  selectedTrainLocation: null,
  selectedTrainStation: null,
  selectedTrainLine: null,
  selectedTrainArrivals: [],
  selectedTrainDestination: "",
  selectedTrainSearchQuery: null,
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
const selectedStopSelect = document.querySelector("#selectedStopSelect");
const busLocateButton = document.querySelector("#busLocateButton");
const busLocationForm = document.querySelector("#busLocationForm");
const busLocationInput = document.querySelector("#busLocationInput");
const busRouteSelect = document.querySelector("#busRouteSelect");
const busDestinationSelect = document.querySelector("#busDestinationSelect");
const busDelaySelect = document.querySelector("#busDelaySelect");
const busRefreshSelect = document.querySelector("#busRefreshSelect");
const trainLocateButton = document.querySelector("#trainLocateButton");
const trainLocationForm = document.querySelector("#trainLocationForm");
const trainLocationInput = document.querySelector("#trainLocationInput");
const trainStationSelect = document.querySelector("#trainStationSelect");
const trainLineSelect = document.querySelector("#trainLineSelect");
const trainDestinationSelect = document.querySelector("#trainDestinationSelect");
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
busLocateButton.addEventListener("click", () => locateForSelection("bus"));
busLocationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = busLocationInput.value.trim();
  if (query) searchSelectionLocation("bus", query);
});
selectedStopSelect.addEventListener("change", () => {
  const stop = state.selectedAreaStops.find((item) => getStopId(item) === selectedStopSelect.value);
  if (stop) {
    state.selectedBusRoute = "";
    state.selectedBusDestination = "";
    loadSelectedStopArrivals(stop);
  }
});
busRouteSelect.addEventListener("change", () => {
  state.selectedBusRoute = busRouteSelect.value;
  state.selectedBusDestination = "";
  syncBusFilters();
  renderSelectedStopWithFilters();
});
busDestinationSelect.addEventListener("change", () => {
  state.selectedBusDestination = busDestinationSelect.value;
  renderSelectedStopWithFilters();
});
trainLocateButton.addEventListener("click", () => locateForSelection("train"));
trainLocationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = trainLocationInput.value.trim();
  if (query) searchSelectionLocation("train", query);
});
trainStationSelect.addEventListener("change", () => loadSelectedTrainStation());
trainLineSelect.addEventListener("change", () => {
  const station = getSelectedTrainStation();
  if (station && trainLineSelect.value) {
    state.selectedTrainDestination = "";
    loadSelectedTrainLine(station, trainLineSelect.value);
  }
});
trainDestinationSelect.addEventListener("change", () => {
  state.selectedTrainDestination = trainDestinationSelect.value;
  renderSelectedTrainWithFilters();
});
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

function locateForSelection(type) {
  if (!navigator.geolocation) {
    setStatus("This browser cannot share location. Enter a location instead.", "error");
    return;
  }

  const label = type === "bus" ? "bus stops" : "train stations";
  setStatus(`Finding your location for nearby ${label}...`, "waiting");
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const location = {
        lat: position.coords.latitude,
        lon: position.coords.longitude,
        label: "your location",
      };
      if (type === "bus") {
        busLocationInput.value = "Your location";
        loadNearbyBusStopsForSelection(location);
      } else {
        trainLocationInput.value = "Your location";
        loadNearbyTrainStationsForSelection(location);
      }
    },
    () => {
      setStatus("Location was blocked. Enter a location instead.", "error");
    },
    {
      enableHighAccuracy: true,
      maximumAge: 60_000,
      timeout: 10_000,
    },
  );
}

async function searchSelectionLocation(type, query) {
  const label = type === "bus" ? "bus stops" : "train stations";
  setStatus(`Searching for nearby ${label} around ${query}...`, "waiting");
  try {
    const location = await lookupLocation(query);
    if (type === "bus") {
      busLocationInput.value = query;
      loadNearbyBusStopsForSelection(location);
    } else {
      trainLocationInput.value = query;
      loadNearbyTrainStationsForSelection(location);
    }
  } catch (error) {
    console.error(error);
    setStatus("Location could not be found. Try a postcode, station, road, or place.", "error");
  }
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

async function loadNearbyBusStopsForSelection(location, preferredStopId = state.savedStopId) {
  state.loading = true;
  state.selectedBusLocation = location;
  state.selectedStop = null;
  state.selectedStopArrivals = [];
  state.selectedBusRoute = "";
  state.selectedBusDestination = "";
  state.selectedSearchQuery = location.label || "";
  state.selectedAreaStops = [];
  selectedStopSelect.disabled = true;
  selectedStopSelect.innerHTML = `<option>Loading bus stops...</option>`;
  resetBusFilterSelects("Choose a bus stop first", "Choose a route first");
  selectedStopTitle.textContent = "Select a bus stop";
  selectedStopPanel.innerHTML = `<div class="empty-state">Loading bus stops within 1 km of ${escapeHtml(location.label || "this location")}...</div>`;
  setStatus(`Loading bus stops within 1 km of ${location.label || "this location"}...`, "waiting");
  lastUpdated.textContent = "";
  updateBookmarkUrl();

  try {
    const stops = await findNearbyBusStopsWithin1km(location);
    state.selectedAreaStops = stops;

    if (!stops.length) {
      selectedStopSelect.innerHTML = `<option>No bus stops found</option>`;
      selectedStopPanel.innerHTML = `<div class="empty-state">No bus stops were found within 1 km of this location.</div>`;
      setStatus(`No bus stops were found within 1 km of ${location.label || "this location"}.`, "error");
      return;
    }

    populateBusStopSelect(stops);
    selectedStopSelect.disabled = false;
    const preferredStop = preferredStopId ? stops.find((stop) => getStopId(stop) === preferredStopId) : null;
    state.savedStopId = null;
    if (preferredStop) {
      selectedStopSelect.value = getStopId(preferredStop);
      await loadSelectedStopArrivals(preferredStop);
    } else {
      selectedStopPanel.innerHTML = `<div class="empty-state">Found ${stops.length} bus stops within 1 km. Choose one to see live arrivals.</div>`;
      setStatus(`Found ${stops.length} bus stops within 1 km of ${location.label || "this location"}.`, "ready");
    }
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

async function loadNearbyTrainStationsForSelection(location, preferredStationId = null, preferredLine = state.savedTrainLine) {
  state.loading = true;
  state.selectedTrainLocation = location;
  state.selectedTrainSearchQuery = location.label || "";
  state.availableTrainStations = [];
  state.selectedTrainStation = null;
  state.selectedTrainLine = null;
  state.selectedTrainArrivals = [];
  state.selectedTrainDestination = "";
  trainStationSelect.disabled = true;
  trainStationSelect.innerHTML = `<option>Loading train stations...</option>`;
  trainLineSelect.disabled = true;
  trainLineSelect.innerHTML = `<option>Choose a station first</option>`;
  resetTrainDestinationSelect();
  selectedTrainTitle.textContent = "Select a train station";
  selectedTrainSubtitle.textContent = "Loading nearby stations";
  selectedTrainPanel.innerHTML = `<div class="empty-state">Loading train stations within 1 km of ${escapeHtml(location.label || "this location")}...</div>`;
  lineStatusPanel.innerHTML = "";
  setStatus(`Loading train stations within 1 km of ${location.label || "this location"}...`, "waiting");
  lastUpdated.textContent = "";
  updateBookmarkUrl();

  try {
    const stations = await findNearbyTrainStationsWithin1km(location);
    state.availableTrainStations = stations;
    populateTrainStations();
    if (!stations.length) {
      selectedTrainPanel.innerHTML = `<div class="empty-state">No train stations were found within 1 km of this location.</div>`;
      setStatus(`No train stations were found within 1 km of ${location.label || "this location"}.`, "error");
      return;
    }
    const preferredIndex = preferredStationId ? stations.findIndex((station) => station.id === preferredStationId) : -1;
    if (preferredIndex >= 0) {
      trainStationSelect.value = String(preferredIndex);
      await loadSelectedTrainStation(preferredLine);
    } else {
      selectedTrainPanel.innerHTML = `<div class="empty-state">Found ${stations.length} train stations within 1 km. Choose one to see live arrivals.</div>`;
      setStatus(`Found ${stations.length} train stations within 1 km of ${location.label || "this location"}.`, "ready");
    }
    updateBookmarkUrl();
    lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  } catch (error) {
    console.error(error);
    selectedTrainPanel.innerHTML = `<div class="empty-state">Train stations could not be loaded. Please try again.</div>`;
    setStatus("Train stations could not be loaded. Please try again.", "error");
  } finally {
    state.loading = false;
    scheduleNextRefresh();
  }
}

async function loadSelectedStopArrivals(stop, preferredRoute = state.selectedBusRoute, preferredDestination = state.selectedBusDestination) {
  if (state.loading) {
    state.selectedStop = stop;
    state.pendingReload = true;
    return;
  }

  state.loading = true;
  state.selectedStop = stop;
  state.selectedStopArrivals = [];
  state.selectedBusRoute = preferredRoute || "";
  state.selectedBusDestination = preferredDestination || "";
  updateBookmarkUrl();
  selectedStopTitle.textContent = cleanStationName(stop.commonName || "Selected bus stop");
  selectedStopPanel.innerHTML = "";
  renderSkeletons(selectedStopPanel, 1);
  setStatus(`Loading buses for ${cleanStationName(stop.commonName || "selected bus stop")}...`, "waiting");
  lastUpdated.textContent = "";

  try {
    const arrivals = await getArrivals(getStopId(stop), "bus", SELECTED_STOP_FILTER_CANDIDATES);
    state.selectedStopArrivals = arrivals;
    syncBusFilters();
    renderSelectedStopWithFilters();
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
  state.selectedTrainArrivals = [];
  state.selectedTrainDestination = "";
  trainLineSelect.disabled = true;
  trainLineSelect.innerHTML = `<option>Loading train lines...</option>`;
  resetTrainDestinationSelect();
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

async function loadSelectedTrainLine(station, lineId, preferredDestination = state.selectedTrainDestination) {
  if (state.loading) {
    state.selectedTrainStation = station;
    state.selectedTrainLine = lineId;
    state.pendingReload = true;
    return;
  }

  state.loading = true;
  state.selectedTrainStation = station;
  state.selectedTrainLine = lineId;
  state.selectedTrainDestination = preferredDestination || "";
  state.selectedTrainArrivals = [];
  updateBookmarkUrl();
  trainLineSelect.value = lineId;
  resetTrainDestinationSelect("Loading destinations...");
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
    state.selectedTrainArrivals = arrivals;
    syncTrainDestinationSelect();
    renderLineStatus(lineStatus, lineId);
    renderSelectedTrainWithFilters(lineStatus);
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

function resetBusFilterSelects(routeLabel = "Choose a bus stop first", destinationLabel = "Choose a route first") {
  busRouteSelect.disabled = true;
  busRouteSelect.innerHTML = `<option value="">${escapeHtml(routeLabel)}</option>`;
  busDestinationSelect.disabled = true;
  busDestinationSelect.innerHTML = `<option value="">${escapeHtml(destinationLabel)}</option>`;
}

function syncBusFilters() {
  const routeOptions = getBusRouteOptions(state.selectedStopArrivals);
  busRouteSelect.innerHTML = [`<option value="">All routes</option>`]
    .concat(routeOptions.map((route) => `<option value="${escapeHtml(route)}">${escapeHtml(route)}</option>`))
    .join("");
  busRouteSelect.disabled = routeOptions.length === 0;
  if (!routeOptions.includes(state.selectedBusRoute)) state.selectedBusRoute = "";
  busRouteSelect.value = state.selectedBusRoute;

  const destinationOptions = getBusDestinationOptions(state.selectedStopArrivals, state.selectedBusRoute);
  busDestinationSelect.innerHTML = [`<option value="">All destinations</option>`]
    .concat(destinationOptions.map((destination) => `<option value="${escapeHtml(destination)}">${escapeHtml(destination)}</option>`))
    .join("");
  busDestinationSelect.disabled = destinationOptions.length === 0;
  if (!destinationOptions.includes(state.selectedBusDestination)) state.selectedBusDestination = "";
  busDestinationSelect.value = state.selectedBusDestination;
}

function renderSelectedStopWithFilters() {
  if (!state.selectedStop) return;
  const filteredArrivals = filterBusArrivals(
    state.selectedStopArrivals,
    state.selectedBusRoute,
    state.selectedBusDestination,
  ).slice(0, SELECTED_STOP_ARRIVALS);
  renderSelectedStop(state.selectedStop, filteredArrivals);
  setSelectedStopStatus(state.selectedStop, filteredArrivals.length);
  updateBookmarkUrl();
}

function resetTrainDestinationSelect(label = "Choose a line first") {
  trainDestinationSelect.disabled = true;
  trainDestinationSelect.innerHTML = `<option value="">${escapeHtml(label)}</option>`;
}

function syncTrainDestinationSelect() {
  const destinations = getDestinationOptions(state.selectedTrainArrivals);
  trainDestinationSelect.innerHTML = [`<option value="">All destinations</option>`]
    .concat(destinations.map((destination) => `<option value="${escapeHtml(destination)}">${escapeHtml(destination)}</option>`))
    .join("");
  trainDestinationSelect.disabled = destinations.length === 0;
  if (!destinations.includes(state.selectedTrainDestination)) state.selectedTrainDestination = "";
  trainDestinationSelect.value = state.selectedTrainDestination;
}

function renderSelectedTrainWithFilters(lineStatus = null) {
  if (!state.selectedTrainStation || !state.selectedTrainLine) return;
  const station = state.selectedTrainStation;
  const lineId = state.selectedTrainLine;
  const filteredArrivals = filterArrivalsByDestination(state.selectedTrainArrivals, state.selectedTrainDestination);
  renderSelectedTrainStation(station, filteredArrivals, lineId);
  setTrainStationStatus(station, lineId, filteredArrivals.length, lineStatus);
  updateBookmarkUrl();
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

async function findNearbyBusStopsWithin1km(location) {
  return findStopsWithinRadius({
    ...location,
    stopTypes: "NaptanPublicBusCoachTram",
    modes: "bus",
    radius: 1000,
    limit: 60,
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

async function searchTrainStations(query) {
  const postcodeLocation = await lookupPostcode(query);
  if (postcodeLocation) {
    return findClosestPlaces({
      ...postcodeLocation,
      stopTypes: "NaptanMetroStation,NaptanRailStation",
      modes: "tube,dlr,overground,elizabeth-line,national-rail,tram",
      targetCount: SELECTED_STOP_CANDIDATES,
      candidateCount: SELECTED_STOP_CANDIDATES,
    });
  }

  const url = new URL(`${API_BASE}/StopPoint/Search/${encodeURIComponent(query)}`);
  url.searchParams.set("modes", "tube,dlr,overground,elizabeth-line,national-rail,tram");
  const data = await fetchJson(url);

  return (data.matches || [])
    .filter(
      (match) =>
        match.id &&
        Number.isFinite(match.lat) &&
        Number.isFinite(match.lon) &&
        (match.modes || []).some((mode) => STATION_MODES.has(mode)),
    )
    .map((match) => ({
      id: match.id,
      name: cleanStationName(match.name || "Unnamed station"),
      commonName: match.name,
      lat: match.lat,
      lon: match.lon,
      distance: match.distance ?? null,
      lines: [],
    }))
    .slice(0, SELECTED_STOP_CANDIDATES);
}

async function loadSearchedTrainStations(query, preferredStationId = null, preferredLine = state.savedTrainLine) {
  try {
    const location = await lookupLocation(query);
    trainLocationInput.value = query;
    await loadNearbyTrainStationsForSelection(location, preferredStationId, preferredLine);
  } catch (error) {
    console.error(error);
    setStatus("Train station search could not be loaded. Please try again.", "error");
  }
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

async function findNearbyTrainStationsWithin1km(location) {
  return findStopsWithinRadius({
    ...location,
    stopTypes: "NaptanMetroStation,NaptanRailStation",
    modes: "tube,dlr,overground,elizabeth-line,national-rail,tram",
    radius: 1000,
    limit: 40,
  });
}

async function findStopsWithinRadius({ lat, lon, stopTypes, modes, radius, limit }) {
  const url = new URL(`${API_BASE}/StopPoint`);
  url.searchParams.set("lat", lat);
  url.searchParams.set("lon", lon);
  url.searchParams.set("stopTypes", stopTypes);
  url.searchParams.set("modes", modes);
  url.searchParams.set("radius", radius);

  const data = await fetchJson(url);
  return (data.stopPoints || [])
    .filter((stop) => stop.status !== false && (stop.id || stop.naptanId))
    .sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE))
    .slice(0, limit);
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

  if (page === "live") {
    if (state.lastLocation) {
      setStatus("Live nearby arrivals are ready.", "ready");
    } else {
      setStatus("Choose a location to see nearby buses and trains.", "waiting");
    }
  } else if (page === "select" && state.selectedStop) {
    setStatus(`Showing selected stop: ${cleanStationName(state.selectedStop.commonName || "bus stop")}.`, "ready");
  } else if (page === "select") {
    setStatus("Search a location to load bus stops within 1 km.", "waiting");
  } else if (page === "train" && state.selectedTrainStation) {
    setStatus(`Showing selected station: ${state.selectedTrainStation.name}.`, "ready");
  } else if (page === "train") {
    setStatus("Search a location to load train stations within 1 km.", "waiting");
  }
}

function refreshActivePage() {
  if (state.activePage === "select") {
    if (state.selectedStop) {
      loadSelectedStopArrivals(state.selectedStop, state.selectedBusRoute, state.selectedBusDestination);
      return true;
    }
    if (state.selectedBusLocation) {
      loadNearbyBusStopsForSelection(state.selectedBusLocation, state.savedStopId);
      return true;
    }
    return false;
  }

  if (state.activePage === "train") {
    if (state.selectedTrainStation && state.selectedTrainLine) {
      loadSelectedTrainLine(state.selectedTrainStation, state.selectedTrainLine, state.selectedTrainDestination);
      return true;
    }
    if (state.selectedTrainLocation) {
      loadNearbyTrainStationsForSelection(
        state.selectedTrainLocation,
        state.selectedTrainStation?.id || null,
        state.savedTrainLine,
      );
      return true;
    }
    return false;
  }

  if (state.lastLocation) {
    loadNearby(state.lastLocation);
    return true;
  }

  return false;
}

function populateAreas() {}

function populateTrainStations() {
  const stations = state.availableTrainStations.length ? state.availableTrainStations : TRAIN_STATIONS;
  trainStationSelect.innerHTML = stations.map(
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

function getSelectedTrainStation() {
  const stations = state.availableTrainStations.length ? state.availableTrainStations : TRAIN_STATIONS;
  return stations[Number.parseInt(trainStationSelect.value, 10)] || stations[0] || TRAIN_STATIONS[0];
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
    state.savedStopId = params.get("stop");
    state.selectedBusRoute = params.get("route") || "";
    state.selectedBusDestination = params.get("destination") || "";
    const lat = Number.parseFloat(params.get("lat"));
    const lon = Number.parseFloat(params.get("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      busLocationInput.value = params.get("q") || params.get("label") || "bookmarked location";
      loadNearbyBusStopsForSelection(
        {
          lat,
          lon,
          label: params.get("label") || "bookmarked location",
        },
        state.savedStopId,
      );
      return;
    }
    return;
  }

  if (page === "train") {
    state.savedTrainLine = params.get("line");
    state.selectedTrainDestination = params.get("destination") || "";
    const lat = Number.parseFloat(params.get("lat"));
    const lon = Number.parseFloat(params.get("lon"));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      trainLocationInput.value = params.get("q") || params.get("label") || "bookmarked location";
      loadNearbyTrainStationsForSelection(
        {
          lat,
          lon,
          label: params.get("label") || "bookmarked location",
        },
        params.get("station"),
        state.savedTrainLine,
      );
      return;
    }
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
    if (state.selectedBusLocation) {
      params.set("lat", trimCoordinate(state.selectedBusLocation.lat));
      params.set("lon", trimCoordinate(state.selectedBusLocation.lon));
      params.set("label", state.selectedBusLocation.label || "bookmarked location");
      params.set("q", busLocationInput.value || state.selectedBusLocation.label || "");
    }
    if (state.selectedStop) params.set("stop", getStopId(state.selectedStop));
    if (state.selectedBusRoute) params.set("route", state.selectedBusRoute);
    if (state.selectedBusDestination) params.set("destination", state.selectedBusDestination);
  }

  if (state.activePage === "train") {
    params.set("delay", String(state.delayMinutes));
    params.set("refresh", state.autoRefreshEnabled ? "on" : "off");
    if (state.selectedTrainLocation) {
      params.set("lat", trimCoordinate(state.selectedTrainLocation.lat));
      params.set("lon", trimCoordinate(state.selectedTrainLocation.lon));
      params.set("label", state.selectedTrainLocation.label || "bookmarked location");
      params.set("q", trainLocationInput.value || state.selectedTrainLocation.label || "");
    }
    const station = state.selectedTrainStation || getSelectedTrainStation();
    if (station?.id) params.set("station", station.id);
    if (state.selectedTrainLine) params.set("line", state.selectedTrainLine);
    if (state.selectedTrainDestination) params.set("destination", state.selectedTrainDestination);
  }

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function getTrainStationIndex(value) {
  if (!value) return -1;
  const asNumber = Number.parseInt(value, 10);
  const stations = state.availableTrainStations.length ? state.availableTrainStations : TRAIN_STATIONS;
  if (Number.isInteger(asNumber) && stations[asNumber]) return asNumber;
  return stations.findIndex((station) => station.id === value);
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

function getBusRouteOptions(arrivals) {
  return [...new Set(arrivals.map((arrival) => arrival.lineName || arrival.lineId).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function getBusDestinationOptions(arrivals, route) {
  return getDestinationOptions(route ? arrivals.filter((arrival) => (arrival.lineName || arrival.lineId) === route) : arrivals);
}

function getDestinationOptions(arrivals) {
  return [...new Set(arrivals.map((arrival) => cleanStationName(arrival.destinationName || "")).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function filterBusArrivals(arrivals, route, destination) {
  return arrivals.filter((arrival) => {
    const matchesRoute = !route || (arrival.lineName || arrival.lineId) === route;
    const matchesDestination = !destination || cleanStationName(arrival.destinationName || "") === destination;
    return matchesRoute && matchesDestination;
  });
}

function filterArrivalsByLine(arrivals, lineId) {
  if (lineId === "national-rail") {
    return arrivals.filter((arrival) => arrival.modeName === "national-rail" && isAfterDelay(arrival.timeToStation));
  }

  return arrivals.filter((arrival) => arrival.lineId === lineId && isAfterDelay(arrival.timeToStation));
}

function filterArrivalsByDestination(arrivals, destination) {
  if (!destination) return arrivals;
  return arrivals.filter((arrival) => cleanStationName(arrival.destinationName || "") === destination);
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
