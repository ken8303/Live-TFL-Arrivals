const API_BASE = `${window.location.origin}/api/tfl`;
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
const SCHEDULE_STORAGE_KEY = "live-tfl-arrivals-schedules";
const PUSH_DEVICE_TOKEN_STORAGE_KEY = "live-tfl-arrivals-push-device-token";
const SCHEDULE_CATCHUP_MS = 15 * 60 * 1000;
const READING_BUS_PROVIDER = "reading-buses";
const SCHEDULE_WEEKDAYS = [
  { value: 1, label: "Mon", longLabel: "Monday" },
  { value: 2, label: "Tue", longLabel: "Tuesday" },
  { value: 3, label: "Wed", longLabel: "Wednesday" },
  { value: 4, label: "Thu", longLabel: "Thursday" },
  { value: 5, label: "Fri", longLabel: "Friday" },
  { value: 6, label: "Sat", longLabel: "Saturday" },
  { value: 0, label: "Sun", longLabel: "Sunday" },
];
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
const NATIONAL_RAIL_FALLBACK_STATIONS = [
  {
    name: "Reading",
    crs: "RDG",
    lat: 51.459069,
    lon: -0.972051,
    lines: [
      { id: "elizabeth", name: "Elizabeth line" },
      { id: "national-rail", name: "National Rail" },
    ],
  },
  { name: "Reading West", crs: "RDW", lat: 51.455578, lon: -0.99012 },
  { name: "Tilehurst", crs: "TLH", lat: 51.47153, lon: -1.029842 },
  { name: "Twyford", crs: "TWY", lat: 51.475528, lon: -0.863293 },
  { name: "Maidenhead", crs: "MAI", lat: 51.51867, lon: -0.722626 },
  { name: "Slough", crs: "SLO", lat: 51.511877, lon: -0.591499 },
  { name: "Didcot Parkway", crs: "DID", lat: 51.610952, lon: -1.242886 },
  { name: "Oxford", crs: "OXF", lat: 51.753496, lon: -1.270152 },
  { name: "Newbury", crs: "NBY", lat: 51.397645, lon: -1.322877 },
  { name: "Basingstoke", crs: "BSK", lat: 51.268356, lon: -1.087264 },
  { name: "Wokingham", crs: "WKM", lat: 51.41124, lon: -0.842515 },
  { name: "Bristol Temple Meads", crs: "BRI", lat: 51.449139, lon: -2.581315 },
  { name: "Bath Spa", crs: "BTH", lat: 51.377683, lon: -2.357034 },
  { name: "Cardiff Central", crs: "CDF", lat: 51.475953, lon: -3.178609 },
  { name: "Birmingham New Street", crs: "BHM", lat: 52.477777, lon: -1.898842 },
  { name: "Manchester Piccadilly", crs: "MAN", lat: 53.477356, lon: -2.230911 },
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
  busMapPoints: [],
  selectedBusPointId: null,
  selectedStop: null,
  selectedStopArrivals: [],
  selectedBusRoute: "",
  selectedBusDestination: "",
  selectedSearchQuery: null,
  availableTrainStations: [...TRAIN_STATIONS],
  selectedTrainLocation: null,
  trainMapPoints: [],
  selectedTrainPointId: null,
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
  schedulerDraft: null,
  savedSchedules: [],
  schedulerTimer: null,
  schedulerTimeoutAt: null,
  serverPushConfigured: false,
  serverPushPublicKey: "",
  serverPushSubscription: null,
  readingBusCatalog: null,
  readingBusCatalogLoaded: false,
};

const livePage = document.querySelector("#livePage");
const selectPage = document.querySelector("#selectPage");
const selectTrainPage = document.querySelector("#selectTrainPage");
const schedulerPage = document.querySelector("#schedulerPage");
const liveNavButton = document.querySelector("#liveNavButton");
const selectNavButton = document.querySelector("#selectNavButton");
const selectTrainNavButton = document.querySelector("#selectTrainNavButton");
const schedulerNavButton = document.querySelector("#schedulerNavButton");
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
const busMapPreview = document.querySelector("#busMapPreview");
const busMapFrame = document.querySelector("#busMapFrame");
const busMapLegend = document.querySelector("#busMapLegend");
const busMapPreviewText = document.querySelector("#busMapPreviewText");
const busRouteSelect = document.querySelector("#busRouteSelect");
const busDestinationSelect = document.querySelector("#busDestinationSelect");
const busDelaySelect = document.querySelector("#busDelaySelect");
const busRefreshSelect = document.querySelector("#busRefreshSelect");
const busScheduleButton = document.querySelector("#busScheduleButton");
const trainLocateButton = document.querySelector("#trainLocateButton");
const trainLocationForm = document.querySelector("#trainLocationForm");
const trainLocationInput = document.querySelector("#trainLocationInput");
const trainMapPreview = document.querySelector("#trainMapPreview");
const trainMapFrame = document.querySelector("#trainMapFrame");
const trainMapLegend = document.querySelector("#trainMapLegend");
const trainMapPreviewText = document.querySelector("#trainMapPreviewText");
const trainStationSelect = document.querySelector("#trainStationSelect");
const trainLineSelect = document.querySelector("#trainLineSelect");
const trainDestinationSelect = document.querySelector("#trainDestinationSelect");
const trainDelaySelect = document.querySelector("#trainDelaySelect");
const trainRefreshSelect = document.querySelector("#trainRefreshSelect");
const trainScheduleButton = document.querySelector("#trainScheduleButton");
const schedulerDraftType = document.querySelector("#schedulerDraftType");
const schedulerDraftTitle = document.querySelector("#schedulerDraftTitle");
const schedulerDraftSubtitle = document.querySelector("#schedulerDraftSubtitle");
const enableNotificationsButton = document.querySelector("#enableNotificationsButton");
const testNotificationButton = document.querySelector("#testNotificationButton");
const notificationSupportText = document.querySelector("#notificationSupportText");
const notificationPermissionText = document.querySelector("#notificationPermissionText");
const schedulerTimeInput = document.querySelector("#schedulerTimeInput");
const weekdayGrid = document.querySelector("#weekdayGrid");
const schedulerPreviewList = document.querySelector("#schedulerPreviewList");
const saveScheduleButton = document.querySelector("#saveScheduleButton");
const savedSchedulesList = document.querySelector("#savedSchedulesList");

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
busMapLegend.addEventListener("click", (event) => handleSelectionMapLegendClick(event, "bus"));
trainMapLegend.addEventListener("click", (event) => handleSelectionMapLegendClick(event, "train"));
liveNavButton.addEventListener("click", () => showPage("live"));
selectNavButton.addEventListener("click", () => showPage("select"));
selectTrainNavButton.addEventListener("click", () => showPage("train"));
schedulerNavButton.addEventListener("click", () => showPage("scheduler"));
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
    selectSelectionMapPoint("bus", getLiveMapPointId(stop, "bus"), { scroll: false });
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
busScheduleButton.addEventListener("click", () => openSchedulerFromSelection("bus"));
selectedStopPanel.addEventListener("click", (event) => handleSelectionCardClick(event, "bus"));
trainLocateButton.addEventListener("click", () => locateForSelection("train"));
trainLocationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = trainLocationInput.value.trim();
  if (query) searchSelectionLocation("train", query);
});
trainStationSelect.addEventListener("change", () => {
  const station = getSelectedTrainStation();
  if (station) {
    selectSelectionMapPoint("train", getLiveMapPointId(station, "train"), { scroll: false });
  }
  loadSelectedTrainStation();
});
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
trainScheduleButton.addEventListener("click", () => openSchedulerFromSelection("train"));
selectedTrainPanel.addEventListener("click", (event) => handleSelectionCardClick(event, "train"));
enableNotificationsButton.addEventListener("click", requestNotificationPermission);
testNotificationButton.addEventListener("click", sendTestNotification);
saveScheduleButton.addEventListener("click", saveCurrentSchedule);
weekdayGrid.addEventListener("change", renderSchedulerPreview);
schedulerTimeInput.addEventListener("change", () => {
  schedulerTimeInput.value = normaliseScheduleTimeStep(schedulerTimeInput.value || "08:00");
  renderSchedulerPreview();
});
savedSchedulesList.addEventListener("click", handleSavedSchedulesClick);
populateTrainStations();
populateDelaySelects();
loadSavedSchedules();
restoreFromUrl();
startAutoRefresh();
registerServiceWorker();
initServerPush();
registerSchedulerWakeHandlers();
refreshSchedulerUi();
scheduleSavedNotifications();

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
    const nationalRailStation = type === "train" ? getExactNationalRailFallbackStation(query) : null;
    const location = nationalRailStation
      ? { lat: nationalRailStation.lat, lon: nationalRailStation.lon, label: nationalRailStation.name }
      : await lookupLocation(query);
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
      setStatus(`No ${formatSelectedModes(options)} were found nearby. TfL and Reading Buses were both checked.`, "error");
      return;
    }

    const candidatesWithArrivals = await Promise.all(
      stops.map(async (stop) => ({
        stop,
        arrivals: await getBusArrivals(stop),
      })),
    );
    const liveStops = candidatesWithArrivals.filter(({ arrivals }) => arrivals.length > 0);
    const emptyStops = candidatesWithArrivals.filter(({ arrivals }) => arrivals.length === 0);
    const stopsWithArrivals = [...liveStops, ...emptyStops].slice(0, options.busCount);

    const candidatesWithDepartures = await Promise.all(
      stations.map(async (stop) => ({
        stop,
        arrivals: await getLiveTrainArrivals(stop),
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
  state.busMapPoints = [];
  state.selectedBusPointId = null;
  updateSelectionMap("bus", location);
  selectedStopSelect.disabled = true;
  selectedStopSelect.innerHTML = `<option>Loading bus stops...</option>`;
  resetBusFilterSelects("Choose a bus stop first", "Choose a route first");
  selectedStopTitle.textContent = "Select a bus stop";
  selectedStopPanel.innerHTML = `<div class="empty-state">Loading bus stops within 1 km of ${escapeHtml(location.label || "this location")}...</div>`;
  setStatus(`Loading bus stops within 1 km of ${location.label || "this location"}...`, "waiting");
  lastUpdated.textContent = "";
  updateBookmarkUrl();

  let shouldScheduleRefresh = true;
  try {
    const stops = await findNearbyBusStopsWithin1km(location);
    state.selectedAreaStops = stops;
    updateSelectionMap("bus", location, buildSelectionMapPoints(stops, "bus"));

    if (!stops.length) {
      selectedStopSelect.innerHTML = `<option>No bus stops found</option>`;
      selectedStopPanel.innerHTML = `<div class="empty-state">No bus stops were found within 1 km of this location.</div>`;
      setStatus(`No bus stops were found within 1 km of ${location.label || "this location"}.`, "error");
      return;
    }

    populateBusStopSelect(stops);
    selectedStopSelect.disabled = false;
    const preferredStop = preferredStopId ? stops.find((stop) => getStopId(stop) === preferredStopId) : null;
    const selectedStop = preferredStop || stops[0] || null;
    state.savedStopId = null;
    if (selectedStop) {
      selectedStopSelect.value = getStopId(selectedStop);
      shouldScheduleRefresh = false;
      state.loading = false;
      await loadSelectedStopArrivals(selectedStop);
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
    if (shouldScheduleRefresh) scheduleNextRefresh();
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
  state.trainMapPoints = [];
  state.selectedTrainPointId = null;
  updateSelectionMap("train", location);
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

  let shouldScheduleRefresh = true;
  try {
    const stations = await findNearbyTrainStationsWithin1km(location);
    state.availableTrainStations = stations;
    updateSelectionMap("train", location, buildSelectionMapPoints(stations, "train"));
    populateTrainStations();
    if (!stations.length) {
      selectedTrainPanel.innerHTML = `<div class="empty-state">No train stations were found within 1 km of this location.</div>`;
      setStatus(`No train stations were found within 1 km of ${location.label || "this location"}.`, "error");
      return;
    }
    const preferredIndex = preferredStationId ? stations.findIndex((station) => matchesPreferredTrainStation(station, preferredStationId)) : -1;
    if (preferredIndex >= 0) {
      trainStationSelect.value = String(preferredIndex);
      shouldScheduleRefresh = false;
      state.loading = false;
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
    if (shouldScheduleRefresh) scheduleNextRefresh();
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
  state.selectedBusPointId = getLiveMapPointId(stop, "bus");
  updateSelectionMap("bus", state.selectedBusLocation, state.busMapPoints);
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
    const arrivals = await getBusArrivals(stop, SELECTED_STOP_FILTER_CANDIDATES);
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
  state.selectedTrainPointId = getLiveMapPointId(station, "train");
  updateSelectionMap("train", state.selectedTrainLocation, state.trainMapPoints);
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
    const arrivals = isNationalRailOnlyStation(station) ? [] : await getStationTrainArrivals(station.id);
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
    lineId === "national-rail" && station.crs
      ? `Next ${NATIONAL_RAIL_RESULTS} departures`
      : shouldUseNationalRailDeparturesForLine(station, lineId)
        ? `Next ${SELECTED_TRAIN_ARRIVALS} departures`
        : `Next ${SELECTED_TRAIN_ARRIVALS} arrivals`;
  lineStatusPanel.innerHTML = `<div class="line-status loading">Loading line status...</div>`;
  selectedTrainPanel.innerHTML = "";
  renderSkeletons(selectedTrainPanel, 1);
  setStatus(`Loading ${formatTrainBoardName(lineId)} at ${station.name}...`, "waiting");
  lastUpdated.textContent = "";

  try {
    const [allArrivals, lineStatus] = await Promise.all([getTrainArrivalsForLine(station, lineId), getLineStatus(lineId)]);
    const limit = getTrainResultLimit(lineId, station);
    const usesDepartureBoard = lineId === "national-rail" && station.crs || shouldUseNationalRailDeparturesForLine(station, lineId);
    const arrivals =
      usesDepartureBoard
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
  updateScheduleButtons();
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
  updateScheduleButtons();
  updateBookmarkUrl();
}

async function findClosestBusStops(location, targetCount) {
  const [tflStops, readingStops] = await Promise.all([
    findClosestPlaces({
      ...location,
      stopTypes: "NaptanPublicBusCoachTram",
      modes: "bus",
      targetCount,
      candidateCount: CANDIDATE_BUS_STOPS,
    }),
    findNearbyReadingBusStops(location, 2500, CANDIDATE_BUS_STOPS),
  ]);
  return [...tflStops, ...readingStops]
    .sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE))
    .slice(0, CANDIDATE_BUS_STOPS);
}

async function findNearbyBusStopsWithin1km(location) {
  const [tflStops, readingStops] = await Promise.all([
    findStopsWithinRadius({
      ...location,
      stopTypes: "NaptanPublicBusCoachTram",
      modes: "bus",
      radius: 1000,
      limit: 60,
    }),
    findNearbyReadingBusStops(location, 1000, 60),
  ]);
  return [...tflStops, ...readingStops]
    .sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE))
    .slice(0, 60);
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

  const tflMatches = (data.matches || [])
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
      provider: "tfl",
    }))
    .slice(0, SELECTED_STOP_CANDIDATES);

  if (tflMatches.length) return tflMatches;
  return searchReadingBusStops(query);
}

async function searchTrainStations(query) {
  const nationalRailMatches = searchNationalRailFallbackStations(query, SELECTED_STOP_CANDIDATES);
  if (nationalRailMatches.length) return nationalRailMatches;

  const postcodeLocation = await lookupPostcode(query);
  if (postcodeLocation) {
    const tflStops = await findClosestPlaces({
      ...postcodeLocation,
      stopTypes: "NaptanMetroStation,NaptanRailStation",
      modes: "tube,dlr,overground,elizabeth-line,national-rail,tram",
      targetCount: SELECTED_STOP_CANDIDATES,
      candidateCount: SELECTED_STOP_CANDIDATES,
    });
    return mergeNearbyTrainStations(tflStops, findNearbyNationalRailFallbackStations(postcodeLocation, 1000));
  }

  const url = new URL(`${API_BASE}/StopPoint/Search/${encodeURIComponent(query)}`);
  url.searchParams.set("modes", "tube,dlr,overground,elizabeth-line,national-rail,tram");
  const data = await fetchJson(url);

  const tflMatches = (data.matches || [])
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

  return mergeTrainStationOptions(tflMatches, nationalRailMatches).slice(0, SELECTED_STOP_CANDIDATES);
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

  const readingStops = await searchReadingBusStops(query);
  const firstReadingStop = readingStops[0];
  if (firstReadingStop && Number.isFinite(firstReadingStop.lat) && Number.isFinite(firstReadingStop.lon)) {
    return {
      label: firstReadingStop.commonName || query,
      lat: firstReadingStop.lat,
      lon: firstReadingStop.lon,
    };
  }

  throw new Error("Location not found");
}

async function findFirstStopWithArrivals(stops) {
  for (const stop of stops.slice(0, 10)) {
    const arrivals = await getBusArrivals(stop, SELECTED_STOP_ARRIVALS);
    if (arrivals.length > 0) return { stop, arrivals };
  }

  return {
    stop: stops[0],
    arrivals: await getBusArrivals(stops[0], SELECTED_STOP_ARRIVALS),
  };
}

async function findClosestStations(location, targetCount) {
  const stops = await findClosestPlaces({
    ...location,
    stopTypes: "NaptanMetroStation,NaptanRailStation",
    modes: "tube,dlr,overground,elizabeth-line,national-rail",
    targetCount,
    candidateCount: CANDIDATE_STATIONS,
  });
  return mergeNearbyTrainStations(stops, findNearbyNationalRailFallbackStations(location, 1500)).slice(0, targetCount);
}

async function findNearbyTrainStationsWithin1km(location) {
  const stops = await findStopsWithinRadius({
    ...location,
    stopTypes: "NaptanMetroStation,NaptanRailStation",
    modes: "tube,dlr,overground,elizabeth-line,national-rail,tram",
    radius: 1000,
    limit: 40,
  });
  return mergeNearbyTrainStations(stops, findNearbyNationalRailFallbackStations(location, 1000));
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

async function getBusArrivals(stop, limit = MAX_ARRIVALS) {
  if (stop?.provider === READING_BUS_PROVIDER) {
    const data = await fetchJson(`/api/reading-buses/predictions?location=${encodeURIComponent(getStopId(stop))}`);
    return (data.arrivals || [])
      .filter((arrival) => arrival.modeName === "bus")
      .sort((a, b) => a.timeToStation - b.timeToStation)
      .filter((arrival) => isAfterDelay(arrival.timeToStation))
      .slice(0, limit);
  }

  return getArrivals(getStopId(stop), "bus", limit);
}

async function getStationTrainArrivals(stationId) {
  const arrivals = await fetchJson(`${API_BASE}/StopPoint/${encodeURIComponent(stationId)}/Arrivals`);

  return arrivals
    .filter((arrival) => STATION_MODES.has(arrival.modeName))
    .sort((a, b) => a.timeToStation - b.timeToStation);
}

async function getLiveTrainArrivals(station) {
  if (isNationalRailOnlyStation(station) && station.crs) {
    return getNationalRailArrivals(station.crs, MAX_ARRIVALS);
  }

  return getArrivals(station.id || station.naptanId, "train");
}

async function getTrainArrivalsForLine(station, lineId) {
  if (lineId === "national-rail" && station.crs) {
    return getNationalRailArrivals(station.crs, NATIONAL_RAIL_RESULTS * 3);
  }
  if (shouldUseNationalRailDeparturesForLine(station, lineId)) {
    return getNationalRailArrivals(station.crs, SELECTED_TRAIN_ARRIVALS * 3, { operator: "elizabeth-line" });
  }

  return getStationTrainArrivals(station.id);
}

async function getNationalRailArrivals(crs, limit, options = {}) {
  const params = new URLSearchParams({
    crs,
    rows: String(limit),
  });
  if (options.operator) params.set("operator", options.operator);
  const data = await fetchJson(`/api/national-rail/arrivals?${params.toString()}`);
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

async function getReadingBusCatalog() {
  if (state.readingBusCatalogLoaded) return state.readingBusCatalog || [];
  try {
    const data = await fetchJson("/api/catalog/bus-stops?provider=reading-buses");
    state.readingBusCatalog = data.items || [];
  } catch (error) {
    console.warn("Reading bus catalog unavailable", error);
    state.readingBusCatalog = [];
  }
  state.readingBusCatalogLoaded = true;
  return state.readingBusCatalog;
}

async function searchReadingBusStops(query) {
  const lowered = query.trim().toLowerCase();
  if (!lowered) return [];
  const stops = await getReadingBusCatalog();
  return stops
    .filter((stop) =>
      [stop.commonName, stop.indicator, stop.stopLetter, getStopId(stop)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lowered)),
    )
    .slice(0, SELECTED_STOP_CANDIDATES);
}

async function findNearbyReadingBusStops(location, radius, limit) {
  const stops = await getReadingBusCatalog();
  return stops
    .map((stop) => ({
      ...stop,
      distance: calculateDistanceMeters(location.lat, location.lon, stop.lat, stop.lon),
    }))
    .filter((stop) => Number.isFinite(stop.distance) && stop.distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(Number(lat2) - Number(lat1));
  const dLon = toRadians(Number(lon2) - Number(lon1));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(Number(lat1))) * Math.cos(toRadians(Number(lat2))) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
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
  selectedStopPanel.append(
    renderCard({
      stop,
      arrivals,
      type: "bus",
      origin: state.selectedBusLocation,
      mapMode: "preview",
      mapTargetId: "busMapPreview",
    }),
  );
}

function renderSelectedTrainStation(station, arrivals, lineId) {
  selectedTrainPanel.innerHTML = "";
  selectedTrainPanel.append(
    renderCard({
      stop: {
        id: station.id,
        naptanId: station.naptanId || station.id,
        commonName: station.name,
        lat: station.lat,
        lon: station.lon,
        lines: [{ id: lineId, name: arrivals[0]?.lineName || formatLineName(lineId) }],
      },
      arrivals,
      type: "train",
      origin: state.selectedTrainLocation,
      boardStation: station,
      mapMode: "preview",
      mapTargetId: "trainMapPreview",
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

function renderCard({ stop, arrivals, type, origin = null, boardStation = null, mapMode = "external", mapTargetId = "liveMapPreview" }) {
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
    node.href = `#${mapTargetId}`;
    node.removeAttribute("target");
    node.removeAttribute("rel");
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

function handleSelectionCardClick(event, type) {
  const card = event.target.closest(".stop-card");
  const location = type === "bus" ? state.selectedBusLocation : state.selectedTrainLocation;
  if (!card || !location) return;
  const fallbackPointId =
    type === "bus" && state.selectedStop
      ? getLiveMapPointId(state.selectedStop, "bus")
      : type === "train" && state.selectedTrainStation
        ? getLiveMapPointId(state.selectedTrainStation, "train")
        : "";
  const pointId = card.dataset.mapPointId || fallbackPointId;
  if (!pointId) return;
  event.preventDefault();
  selectSelectionMapPoint(type, pointId);
}

function handleSelectionMapLegendClick(event, type) {
  const button = event.target.closest("[data-map-point-id]");
  const location = type === "bus" ? state.selectedBusLocation : state.selectedTrainLocation;
  if (!button || !location) return;
  event.preventDefault();
  selectSelectionMapPoint(type, button.dataset.mapPointId);
}

function selectLiveMapPoint(pointId) {
  state.selectedLivePointId = pointId === "__overview__" ? null : pointId;
  updateLiveMap(state.lastLocation, state.liveMapPoints);
  liveMapPreview.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function selectSelectionMapPoint(type, pointId, options = {}) {
  const location = type === "bus" ? state.selectedBusLocation : state.selectedTrainLocation;
  const points = type === "bus" ? state.busMapPoints : state.trainMapPoints;
  if (!location) return;
  if (type === "bus") {
    state.selectedBusPointId = pointId === "__overview__" ? null : pointId;
  } else {
    state.selectedTrainPointId = pointId === "__overview__" ? null : pointId;
  }
  updateSelectionMap(type, location, points);
  if (options.scroll !== false) {
    (type === "bus" ? busMapPreview : trainMapPreview).scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function showPage(page, options = {}) {
  const shouldLoad = options.load !== false;
  state.activePage = page;
  livePage.hidden = page !== "live";
  selectPage.hidden = page !== "select";
  selectTrainPage.hidden = page !== "train";
  schedulerPage.hidden = page !== "scheduler";
  liveNavButton.classList.toggle("active", page === "live");
  selectNavButton.classList.toggle("active", page === "select");
  selectTrainNavButton.classList.toggle("active", page === "train");
  schedulerNavButton.classList.toggle("active", page === "scheduler");
  liveNavButton.setAttribute("aria-pressed", String(page === "live"));
  selectNavButton.setAttribute("aria-pressed", String(page === "select"));
  selectTrainNavButton.setAttribute("aria-pressed", String(page === "train"));
  schedulerNavButton.setAttribute("aria-pressed", String(page === "scheduler"));
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
  } else if (page === "scheduler") {
    refreshSchedulerUi();
    setStatus("Scheduler ready. Save reminder times for your selected bus stop or train station.", "ready");
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

  if (state.activePage === "scheduler") {
    refreshSchedulerUi();
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
  const stations = state.availableTrainStations;
  trainStationSelect.innerHTML = stations.length
    ? stations.map((station, index) => `<option value="${index}">${escapeHtml(station.name)}</option>`).join("")
    : `<option value="">Choose a nearby station first</option>`;
  trainStationSelect.disabled = stations.length === 0;
}

function populateBusStopSelect(stops) {
  selectedStopSelect.innerHTML = stops.length
    ? stops
        .map((stop) => `<option value="${escapeHtml(getStopId(stop))}">${escapeHtml(formatStopOption(stop))}</option>`)
        .join("")
    : `<option value="">Choose a nearby stop first</option>`;
  selectedStopSelect.disabled = stops.length === 0;
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
  const stations = state.availableTrainStations;
  return stations[Number.parseInt(trainStationSelect.value, 10)] || stations[0] || null;
}

function restoreFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const page = ["live", "select", "train", "scheduler"].includes(params.get("page")) ? params.get("page") : "live";

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

  if (page === "scheduler") {
    const scheduleId = params.get("schedule");
    const matchingSchedule = state.savedSchedules.find((schedule) => schedule.id === scheduleId) || state.savedSchedules[0] || null;
    state.schedulerDraft = matchingSchedule ? { ...matchingSchedule } : null;
    if (state.schedulerDraft) syncSchedulerFormFromDraft();
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

  if (state.activePage === "scheduler") {
    const scheduleId = state.schedulerDraft?.id || state.savedSchedules[0]?.id;
    if (scheduleId) params.set("schedule", scheduleId);
  }

  const nextUrl = `${window.location.pathname}?${params.toString()}`;
  if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function getTrainStationIndex(value) {
  if (!value) return -1;
  const asNumber = Number.parseInt(value, 10);
  const stations = state.availableTrainStations;
  if (Number.isInteger(asNumber) && stations[asNumber]) return asNumber;
  return stations.findIndex((station) => station.id === value || station.crs === value);
}

function trimCoordinate(value) {
  return Number(value).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function getStopId(stop) {
  return stop.id || stop.naptanId;
}

function normalizeNearbyTrainStations(stops) {
  const stationsById = new Map();

  stops.forEach((stop) => {
    const stationId = stop.stationNaptan || stop.id || stop.naptanId;
    if (!stationId) return;

    const existing = stationsById.get(stationId);
    const isTopLevelStop = stop.id === stationId || stop.naptanId === stationId;
    const normalized = {
      ...stop,
      id: stationId,
      naptanId: stationId,
      name: cleanStationName(stop.commonName || stop.name || "Unnamed station"),
      commonName: cleanStationName(stop.commonName || stop.name || "Unnamed station"),
      crs: stop.crs || existing?.crs || getKnownNationalRailCrs(stop, stationId),
      lat: Number.isFinite(stop.lat) ? stop.lat : existing?.lat ?? null,
      lon: Number.isFinite(stop.lon) ? stop.lon : existing?.lon ?? null,
      lines: (stop.lines || []).filter((line) => STATION_MODES.has(line.id)),
    };

    if (!existing || isTopLevelStop) {
      stationsById.set(stationId, normalized);
      return;
    }

    if ((normalized.distance ?? Number.MAX_VALUE) < (existing.distance ?? Number.MAX_VALUE)) {
      stationsById.set(stationId, {
        ...existing,
        ...normalized,
        crs: normalized.crs || existing.crs || "",
        lines: normalized.lines.length ? normalized.lines : existing.lines || [],
      });
    } else if (!existing.lines?.length && normalized.lines.length) {
      existing.lines = normalized.lines;
    }
  });

  return [...stationsById.values()].sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE));
}

function makeNationalRailFallbackStation(station, distance = null) {
  return {
    id: `NR:${station.crs}`,
    naptanId: `NR:${station.crs}`,
    name: station.name,
    commonName: station.name,
    crs: station.crs,
    lat: station.lat,
    lon: station.lon,
    distance,
    lines: station.lines || [{ id: "national-rail", name: "National Rail" }],
    provider: "national-rail",
  };
}

function searchNationalRailFallbackStations(query, limit) {
  const normalisedQuery = String(query || "").replace(/\s+/g, " ").toLowerCase().replace(/\bstation\b/g, "").trim();
  if (!normalisedQuery) return [];

  return NATIONAL_RAIL_FALLBACK_STATIONS
    .filter((station) => {
      const name = station.name.toLowerCase();
      const crs = station.crs.toLowerCase();
      return crs === normalisedQuery || name.includes(normalisedQuery) || normalisedQuery.includes(name);
    })
    .map((station) => makeNationalRailFallbackStation(station))
    .slice(0, limit);
}

function getExactNationalRailFallbackStation(query) {
  const normalisedQuery = String(query || "").replace(/\s+/g, " ").toLowerCase().replace(/\bstation\b/g, "").trim();
  if (!normalisedQuery) return null;
  return NATIONAL_RAIL_FALLBACK_STATIONS.find((station) => station.crs.toLowerCase() === normalisedQuery || station.name.toLowerCase() === normalisedQuery) || null;
}

function getKnownNationalRailCrs(stop, stationId = "") {
  const stationName = cleanStationName(stop?.commonName || stop?.name || "");
  const normalisedName = stationName.toLowerCase();
  const id = String(stationId || stop?.id || stop?.naptanId || "");
  const knownById = {
    "910GRDNGSTN": "RDG",
  };
  if (knownById[id]) return knownById[id];
  return NATIONAL_RAIL_FALLBACK_STATIONS.find((station) => station.name.toLowerCase() === normalisedName)?.crs || "";
}

function findNearbyNationalRailFallbackStations(location, radius) {
  return NATIONAL_RAIL_FALLBACK_STATIONS
    .map((station) => ({
      station,
      distance: getDistanceMeters(location, station),
    }))
    .filter(({ distance }) => distance <= radius)
    .sort((a, b) => a.distance - b.distance)
    .map(({ station, distance }) => makeNationalRailFallbackStation(station, distance));
}

function mergeNearbyTrainStations(tflStops, nationalRailStations) {
  return mergeTrainStationOptions(normalizeNearbyTrainStations(tflStops), nationalRailStations)
    .sort((a, b) => (a.distance ?? Number.MAX_VALUE) - (b.distance ?? Number.MAX_VALUE));
}

function mergeTrainStationOptions(...stationGroups) {
  const byKey = new Map();
  stationGroups.flat().forEach((station) => {
    const key = station.crs ? `crs:${station.crs}` : `id:${station.id}`;
    const existing = byKey.get(key);
    if (!existing || (station.distance ?? Number.MAX_VALUE) < (existing.distance ?? Number.MAX_VALUE)) {
      byKey.set(key, station);
    }
  });
  return [...byKey.values()];
}

function matchesPreferredTrainStation(station, preferredStationId) {
  if (!station || !preferredStationId) return false;
  if (station.id === preferredStationId || station.naptanId === preferredStationId) return true;
  const preferredCrs = String(preferredStationId).startsWith("NR:") ? String(preferredStationId).slice(3) : "";
  return Boolean(preferredCrs && station.crs === preferredCrs);
}

function isNationalRailOnlyStation(station) {
  return station?.provider === "national-rail" || (station?.crs && String(station.id || "").startsWith("NR:"));
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
  const boardType = lineId === "national-rail" && station.crs || shouldUseNationalRailDeparturesForLine(station, lineId) ? "departures" : "arrivals";
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
  if (shouldUseNationalRailDeparturesForLine(station, lineId)) return SELECTED_TRAIN_ARRIVALS;
  return lineId === "national-rail" && station.crs ? NATIONAL_RAIL_RESULTS : SELECTED_TRAIN_ARRIVALS;
}

function shouldUseNationalRailDeparturesForLine(station, lineId) {
  return lineId === "elizabeth" && Boolean(station?.crs);
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

function updateSelectionMap(type, location, points = []) {
  const elements = getSelectionMapElements(type);
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  const fallbackText = type === "bus" ? "Search a location to preview nearby bus stops" : "Search a location to preview nearby train stations";

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    elements.frame.removeAttribute("src");
    elements.legend.innerHTML = "";
    elements.text.textContent = fallbackText;
    if (type === "bus") {
      state.busMapPoints = [];
      state.selectedBusPointId = null;
    } else {
      state.trainMapPoints = [];
      state.selectedTrainPointId = null;
    }
    return;
  }

  if (type === "bus") {
    state.busMapPoints = points;
    if (state.selectedBusPointId && !points.some((point) => point.id === state.selectedBusPointId)) {
      state.selectedBusPointId = null;
    }
  } else {
    state.trainMapPoints = points;
    if (state.selectedTrainPointId && !points.some((point) => point.id === state.selectedTrainPointId)) {
      state.selectedTrainPointId = null;
    }
  }

  const selectedPointId = type === "bus" ? state.selectedBusPointId : state.selectedTrainPointId;
  const selectedPoint = points.find((point) => point.id === selectedPointId) || null;
  const label = type === "bus" ? "bus stops" : "train stations";
  elements.text.textContent =
    selectedPoint
      ? `Showing route from ${location.label || "your search"} to ${selectedPoint.label}`
      : points.length > 0
      ? `Showing ${points.length} ${label} around ${location.label || "this area"}`
      : location.label
        ? `Centered on ${location.label}`
        : "Current search area";
  elements.frame.src = buildGoogleMapEmbedUrl(location, selectedPoint ? [selectedPoint] : points);
  renderMapLegendInto(elements.legend, location, points, selectedPoint);
}

function getSelectionMapElements(type) {
  return type === "bus"
    ? { frame: busMapFrame, legend: busMapLegend, text: busMapPreviewText }
    : { frame: trainMapFrame, legend: trainMapLegend, text: trainMapPreviewText };
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

function buildSelectionMapPoints(items, type) {
  return items
    .map((item) => {
      const lat = Number(item?.lat);
      const lon = Number(item?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return {
        id: getLiveMapPointId(item, type),
        type,
        lat,
        lon,
        label: cleanStationName(item.commonName || item.name || (type === "bus" ? "Bus stop" : "Train station")),
        href: getMapUrl(item),
      };
    })
    .filter(Boolean);
}

function renderLiveMap(location, points, selectedPoint = null) {
  liveMapFrame.src = buildGoogleMapEmbedUrl(location, selectedPoint ? [selectedPoint] : points);
  renderMapLegend(location, points, selectedPoint);
}

function renderMapLegend(location, points, selectedPoint = null) {
  renderMapLegendInto(liveMapLegend, location, points, selectedPoint);
}

function renderMapLegendInto(legend, location, points, selectedPoint = null) {
  const legendItems = [
    {
      id: "__overview__",
      type: "current",
      label: selectedPoint ? "Back to overview" : location.label || "Search area",
    },
    ...points,
  ];

  legend.innerHTML = legendItems
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

function loadSavedSchedules() {
  try {
    const raw = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
    state.savedSchedules = raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Could not load saved schedules", error);
    state.savedSchedules = [];
  }
}

function persistSavedSchedules() {
  window.localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(state.savedSchedules));
}

function updateScheduleButtons() {
  busScheduleButton.disabled = !state.selectedStop;
  trainScheduleButton.disabled = !(state.selectedTrainStation && state.selectedTrainLine);
}

function openSchedulerFromSelection(type) {
  const draft = buildScheduleDraft(type);
  if (!draft) {
    setStatus(`Choose a ${type === "bus" ? "bus stop" : "train station and line"} first.`, "error");
    return;
  }

  state.schedulerDraft = draft;
  syncSchedulerFormFromDraft();
  showPage("scheduler");
  renderSchedulerPreview();
}

function buildScheduleDraft(type) {
  if (type === "bus") {
    if (!state.selectedStop) return null;
    const selectionKey = `bus:${getStopId(state.selectedStop)}:${state.selectedBusRoute || "*"}:${state.selectedBusDestination || "*"}`;
    const existing = state.savedSchedules.find((schedule) => schedule.selectionKey === selectionKey);
    return {
      id: existing?.id || null,
      type: "bus",
      selectionKey,
      title: cleanStationName(state.selectedStop.commonName || "Bus stop"),
      subtitle: [
        state.selectedBusRoute ? `Route ${state.selectedBusRoute}` : "All routes",
        state.selectedBusDestination ? `to ${state.selectedBusDestination}` : "All destinations",
      ].join(" · "),
      stopId: getStopId(state.selectedStop),
      provider: state.selectedStop.provider || "tfl",
      route: state.selectedBusRoute || "",
      destination: state.selectedBusDestination || "",
      time: existing?.time || "08:00",
      weekdays: existing?.weekdays || [1, 2, 3, 4, 5],
      pageUrl: window.location.href,
    };
  }

  if (!(state.selectedTrainStation && state.selectedTrainLine)) return null;
  const selectionKey = `train:${state.selectedTrainStation.id}:${state.selectedTrainLine}:${state.selectedTrainDestination || "*"}`;
  const existing = state.savedSchedules.find((schedule) => schedule.selectionKey === selectionKey);
  const lineName = formatLineName(state.selectedTrainLine);
  return {
    id: existing?.id || null,
    type: "train",
    selectionKey,
    title: state.selectedTrainStation.name,
    subtitle: [
      lineName,
      state.selectedTrainDestination ? `to ${state.selectedTrainDestination}` : "All destinations",
    ].join(" · "),
    stationId: state.selectedTrainStation.id,
    crs: state.selectedTrainStation.crs || "",
    lineId: state.selectedTrainLine,
    lineName,
    destination: state.selectedTrainDestination || "",
    time: existing?.time || "08:00",
    weekdays: existing?.weekdays || [1, 2, 3, 4, 5],
    pageUrl: window.location.href,
  };
}

function syncSchedulerFormFromDraft() {
  const draft = state.schedulerDraft;
  schedulerTimeInput.value = normaliseScheduleTimeStep(draft?.time || "08:00");
  const selectedDays = new Set(draft?.weekdays || [1, 2, 3, 4, 5]);
  weekdayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.checked = selectedDays.has(Number.parseInt(input.value, 10));
  });
}

function refreshSchedulerUi() {
  if (!state.schedulerDraft && state.savedSchedules.length) {
    state.schedulerDraft = { ...state.savedSchedules[0] };
    syncSchedulerFormFromDraft();
  }

  updateScheduleButtons();
  const draft = state.schedulerDraft;
  schedulerDraftType.textContent = draft ? (draft.type === "bus" ? "Bus reminder" : "Train reminder") : "Choose bus or train";
  schedulerDraftTitle.textContent = draft
    ? draft.title
    : "Open a bus stop or train station, then tap Schedule.";
  schedulerDraftSubtitle.textContent = draft
    ? draft.subtitle
    : "The scheduler keeps the selected stop, route, line, and destination.";

  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
  notificationSupportText.textContent = getNotificationSupportMessage(standalone);
  notificationPermissionText.textContent = getNotificationPermissionMessage();
  enableNotificationsButton.disabled = !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window);
  testNotificationButton.disabled = !("Notification" in window) || Notification.permission !== "granted";
  saveScheduleButton.disabled = !draft;

  renderSchedulerPreview();
  renderSavedSchedules();
}

function getNotificationPermissionMessage() {
  if (!("Notification" in window)) return "This browser does not support web notifications.";
  if (!("PushManager" in window)) return "This browser does not support server push notifications.";
  if (!state.serverPushConfigured) return "Server push is not configured in Cloudflare yet. Local notifications can still work while the app is open.";
  if (state.serverPushSubscription) return "Server push notifications are enabled for this device.";
  if (Notification.permission === "granted") return "Notifications are enabled for this web app.";
  if (Notification.permission === "denied") return "Notifications are blocked. Change the browser setting to allow them again.";
  return "Notification permission not requested yet.";
}

function getNotificationSupportMessage(standalone) {
  if (!state.serverPushConfigured) {
    return "Server scheduled notifications need Cloudflare push storage and VAPID keys before they can run in the background.";
  }
  return standalone
    ? "This installed web app can receive server scheduled notifications."
    : "Add this app to your Home Screen on iPhone or iPad for the best Apple Web App notification support.";
}

function getSelectedWeekdaysFromForm() {
  return [...weekdayGrid.querySelectorAll('input[type="checkbox"]:checked')]
    .map((input) => Number.parseInt(input.value, 10))
    .sort((a, b) => {
      const indexA = SCHEDULE_WEEKDAYS.findIndex((day) => day.value === a);
      const indexB = SCHEDULE_WEEKDAYS.findIndex((day) => day.value === b);
      return indexA - indexB;
    });
}

async function saveCurrentSchedule() {
  if (!state.schedulerDraft) {
    setStatus("Open a bus stop or train station first, then tap Schedule.", "error");
    return;
  }

  const weekdays = getSelectedWeekdaysFromForm();
  if (!weekdays.length) {
    setStatus("Choose at least 1 weekday for the reminder.", "error");
    return;
  }

  const time = normaliseScheduleTimeStep(schedulerTimeInput.value || "08:00");
  schedulerTimeInput.value = time;
  const schedule = {
    ...state.schedulerDraft,
    id: state.schedulerDraft.id || createScheduleId(),
    time,
    weekdays,
    updatedAt: new Date().toISOString(),
  };

  const existingIndex = state.savedSchedules.findIndex((item) => item.id === schedule.id || item.selectionKey === schedule.selectionKey);
  if (existingIndex >= 0) {
    state.savedSchedules.splice(existingIndex, 1, schedule);
  } else {
    state.savedSchedules.unshift(schedule);
  }

  state.schedulerDraft = schedule;
  persistSavedSchedules();
  scheduleSavedNotifications();
  await syncScheduleToServer(schedule);
  refreshSchedulerUi();
  updateBookmarkUrl();
  setStatus(`Saved scheduler reminder for ${schedule.title}.`, "ready");
}

function handleSavedSchedulesClick(event) {
  const actionButton = event.target.closest("[data-schedule-action]");
  if (!actionButton) return;

  const { scheduleAction, scheduleId } = actionButton.dataset;
  const schedule = state.savedSchedules.find((item) => item.id === scheduleId);
  if (!schedule) return;

  if (scheduleAction === "edit") {
    state.schedulerDraft = { ...schedule };
    syncSchedulerFormFromDraft();
    refreshSchedulerUi();
    showPage("scheduler");
    return;
  }

  if (scheduleAction === "delete") {
    state.savedSchedules = state.savedSchedules.filter((item) => item.id !== scheduleId);
    if (state.schedulerDraft?.id === scheduleId) {
      state.schedulerDraft = state.savedSchedules[0] ? { ...state.savedSchedules[0] } : null;
      syncSchedulerFormFromDraft();
    }
    persistSavedSchedules();
    syncDeletedScheduleToServer(schedule);
    scheduleSavedNotifications();
    refreshSchedulerUi();
    setStatus(`Removed scheduler reminder for ${schedule.title}.`, "ready");
  }
}

function renderSavedSchedules() {
  if (!state.savedSchedules.length) {
    savedSchedulesList.innerHTML = `<div class="empty-state">No saved schedules yet. Open a bus stop or train station and tap Schedule.</div>`;
    return;
  }

  savedSchedulesList.innerHTML = state.savedSchedules
    .map((schedule) => {
      const nextTimes = getNextScheduleTimes(schedule, 3)
        .map((date) => formatScheduleTime(date))
        .join(" · ");
      return `
        <article class="saved-schedule-card">
          <div class="saved-schedule-copy">
            <p class="saved-schedule-type">${escapeHtml(schedule.type === "bus" ? "Bus reminder" : "Train reminder")}</p>
            <h3>${escapeHtml(schedule.title)}</h3>
            <p>${escapeHtml(schedule.subtitle)}</p>
            <p class="saved-schedule-next">${escapeHtml(nextTimes || "No upcoming times")}</p>
          </div>
          <div class="saved-schedule-actions">
            <button class="secondary-button inline-action" type="button" data-schedule-action="edit" data-schedule-id="${escapeHtml(schedule.id)}">Edit</button>
            <button class="secondary-button inline-action" type="button" data-schedule-action="delete" data-schedule-id="${escapeHtml(schedule.id)}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSchedulerPreview() {
  const draft = state.schedulerDraft;
  if (!draft) {
    schedulerPreviewList.innerHTML = "<li>No schedule selected yet.</li>";
    return;
  }

  const previewSchedule = {
    ...draft,
    time: normaliseScheduleTimeStep(schedulerTimeInput.value || draft.time || "08:00"),
    weekdays: getSelectedWeekdaysFromForm(),
  };

  if (!previewSchedule.weekdays.length) {
    schedulerPreviewList.innerHTML = "<li>Choose at least 1 weekday to preview reminder times.</li>";
    return;
  }

  const nextTimes = getNextScheduleTimes(previewSchedule, 3);
  schedulerPreviewList.innerHTML = nextTimes.map((date) => `<li>${escapeHtml(formatScheduleTime(date))}</li>`).join("");
}

function getNextScheduleTimes(schedule, count, fromDate = new Date()) {
  const [hourText, minuteText] = normaliseScheduleTimeStep(schedule.time || "08:00").split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const weekdays = new Set(schedule.weekdays || []);
  const results = [];

  for (let offset = 0; offset < 21 && results.length < count; offset += 1) {
    const candidate = new Date(fromDate);
    candidate.setSeconds(0, 0);
    candidate.setDate(fromDate.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);
    if (!weekdays.has(candidate.getDay())) continue;
    if (candidate <= fromDate) continue;
    results.push(candidate);
  }

  return results;
}

function formatScheduleTime(date) {
  return date.toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function createScheduleId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `schedule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getPushDeviceToken() {
  let token = window.localStorage.getItem(PUSH_DEVICE_TOKEN_STORAGE_KEY) || "";
  if (/^[a-zA-Z0-9_-]{32,160}$/.test(token)) return token;

  if (window.crypto?.randomUUID) {
    token = `${window.crypto.randomUUID()}${window.crypto.randomUUID()}`.replaceAll("-", "");
  } else if (window.crypto?.getRandomValues) {
    const bytes = window.crypto.getRandomValues(new Uint8Array(32));
    token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } else {
    token = `device-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  window.localStorage.setItem(PUSH_DEVICE_TOKEN_STORAGE_KEY, token);
  return token;
}

function getSameOriginPath(value) {
  try {
    const url = new URL(value || "/", window.location.origin);
    if (url.origin !== window.location.origin) return "/";
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return "/";
  }
}

async function initServerPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    refreshSchedulerUi();
    return;
  }

  try {
    const config = await fetchJson("/api/push/public-key");
    state.serverPushConfigured = Boolean(config.configured && config.publicKey);
    state.serverPushPublicKey = config.publicKey || "";
    if (!state.serverPushConfigured) {
      refreshSchedulerUi();
      return;
    }

    const registration = await waitForServiceWorkerReady();
    state.serverPushSubscription = await registration.pushManager.getSubscription();
    if (state.serverPushSubscription && state.savedSchedules.length) {
      await syncAllSchedulesToServer();
    }
    refreshSchedulerUi();
  } catch (error) {
    console.warn("Server push setup could not be checked", error);
    state.serverPushConfigured = false;
    refreshSchedulerUi();
  }
}

async function subscribeToServerPush() {
  if (!state.serverPushConfigured || !state.serverPushPublicKey) return null;

  const registration = await waitForServiceWorkerReady();
  state.serverPushSubscription = await registration.pushManager.getSubscription();
  if (!state.serverPushSubscription) {
    state.serverPushSubscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(state.serverPushPublicKey),
    });
  }

  await syncAllSchedulesToServer();
  return state.serverPushSubscription;
}

async function syncAllSchedulesToServer() {
  if (!state.serverPushSubscription) return;
  await Promise.all(state.savedSchedules.map((schedule) => syncScheduleToServer(schedule)));
}

async function syncScheduleToServer(schedule) {
  if (!state.serverPushConfigured || !state.serverPushSubscription) return;

  try {
    const response = await fetch("/api/push/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: state.serverPushSubscription.toJSON(),
        schedule: {
          ...schedule,
          pageUrl: getSameOriginPath(schedule.pageUrl || window.location.href),
        },
        clientToken: getPushDeviceToken(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/London",
      }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Server push sync failed with status ${response.status}.`);
    }
  } catch (error) {
    console.warn("Could not sync schedule to server push", error);
    setStatus("Schedule saved on this device. Server push could not be synced yet.", "waiting");
  }
}

async function syncDeletedScheduleToServer(schedule) {
  if (!state.serverPushSubscription || !schedule?.id) return;

  try {
    await fetch("/api/push/schedules/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: state.serverPushSubscription.endpoint,
        scheduleId: schedule.id,
        clientToken: getPushDeviceToken(),
      }),
    });
  } catch (error) {
    console.warn("Could not delete server push schedule", error);
  }
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    setStatus("This browser does not support web notifications.", "error");
    refreshSchedulerUi();
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    setStatus("This browser does not support server push notifications.", "error");
    refreshSchedulerUi();
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await subscribeToServerPush();
    refreshSchedulerUi();
    setStatus(state.serverPushSubscription ? "Server push notifications enabled for this device." : "Notifications enabled for this web app.", "ready");
    return;
  }

  refreshSchedulerUi();
  setStatus("Notification permission was not granted.", "error");
}

async function sendTestNotification() {
  if (!("Notification" in window)) {
    setStatus("This browser does not support web notifications.", "error");
    return;
  }

  if (Notification.permission !== "granted") {
    await requestNotificationPermission();
    if (Notification.permission !== "granted") return;
  }

  const title = state.schedulerDraft?.title || "Live TfL Arrivals";
  if (state.serverPushSubscription) {
    const response = await fetch("/api/push/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: state.serverPushSubscription.toJSON(),
        clientToken: getPushDeviceToken(),
        title,
        url: getSameOriginPath(state.schedulerDraft?.pageUrl || window.location.href),
      }),
    });
    if (response.ok) {
      setStatus("Server test notification sent.", "ready");
      return;
    }
  }

  await showAppNotification(title, "Test notification sent from the scheduler.", state.schedulerDraft?.pageUrl || window.location.href);
  setStatus("Test notification sent.", "ready");
}

async function showAppNotification(title, body, url) {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await waitForServiceWorkerReady();
      if (registration?.showNotification) {
        await registration.showNotification(title, {
          body,
          icon: "./icon.svg",
          badge: "./icon-maskable.svg",
          tag: "live-tfl-arrivals-schedule",
          data: { url },
        });
        return;
      }
    } catch (error) {
      console.warn("Service worker notification failed, falling back to Notification()", error);
    }
  }

  new Notification(title, { body });
}

function waitForServiceWorkerReady(timeoutMs = 2500) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("Service worker was not ready in time.")), timeoutMs);
    }),
  ]);
}

function scheduleSavedNotifications() {
  if (state.schedulerTimer) {
    window.clearTimeout(state.schedulerTimer);
    state.schedulerTimer = null;
  }

  const nextDue = state.savedSchedules
    .map((schedule) => ({
      schedule,
      nextAt: getNextScheduleTimes(schedule, 1)[0] || null,
    }))
    .filter((item) => item.nextAt)
    .sort((a, b) => a.nextAt - b.nextAt)[0];

  if (!nextDue) {
    state.schedulerTimeoutAt = null;
    return;
  }

  const delay = Math.max(1000, nextDue.nextAt.getTime() - Date.now());
  state.schedulerTimeoutAt = nextDue.nextAt.getTime();
  state.schedulerTimer = window.setTimeout(async () => {
    await runDueSchedules();
    scheduleSavedNotifications();
  }, delay);
}

async function runDueSchedules() {
  const now = new Date();
  let changed = false;
  const dueSchedules = state.savedSchedules
    .map((schedule) => ({
      schedule,
      dueAt: getPreviousScheduleTime(schedule, now),
    }))
    .filter(({ schedule, dueAt }) => {
      if (!dueAt) return false;
      if (now.getTime() - dueAt.getTime() > SCHEDULE_CATCHUP_MS) return false;
      return dueAt.getTime() > Number(schedule.lastFiredAt || 0);
    });

  for (const { schedule, dueAt } of dueSchedules) {
    await sendScheduleNotification(schedule);
    schedule.lastFiredAt = dueAt.getTime();
    changed = true;
  }

  if (changed) {
    persistSavedSchedules();
    renderSavedSchedules();
  }
}

function getPreviousScheduleTime(schedule, fromDate = new Date()) {
  const [hourText, minuteText] = normaliseScheduleTimeStep(schedule.time || "08:00").split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  const weekdays = new Set(schedule.weekdays || []);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(fromDate);
    candidate.setSeconds(0, 0);
    candidate.setDate(fromDate.getDate() - offset);
    candidate.setHours(hour, minute, 0, 0);
    if (!weekdays.has(candidate.getDay())) continue;
    if (candidate > fromDate) continue;
    return candidate;
  }

  return null;
}

function normaliseScheduleTimeStep(value) {
  const [hourText, minuteText] = String(value || "08:00").split(":");
  const hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute)) return "08:00";
  const roundedMinute = Math.min(55, Math.max(0, Math.round(minute / 5) * 5));
  return `${String(hour).padStart(2, "0")}:${String(roundedMinute).padStart(2, "0")}`;
}

async function sendScheduleNotification(schedule) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    const lines = await fetchScheduleNotificationLines(schedule);
    const body = lines.length
      ? lines.join(" | ")
      : `No live ${schedule.type === "bus" ? "bus" : "train"} times are available right now.`;
    await showAppNotification(schedule.title, body, schedule.pageUrl || window.location.href);
  } catch (error) {
    console.error("Could not send schedule notification", error);
  }
}

async function fetchScheduleNotificationLines(schedule) {
  if (schedule.type === "bus") {
    const arrivals = filterBusArrivals(
      await getBusArrivals(
        {
          id: schedule.stopId,
          naptanId: schedule.stopId,
          provider: schedule.provider || "tfl",
        },
        SELECTED_STOP_FILTER_CANDIDATES,
      ),
      schedule.route || "",
      schedule.destination || "",
    ).slice(0, 3);
    return arrivals.map((arrival) => `${arrival.lineName || arrival.lineId} ${cleanStationName(arrival.destinationName || "")} ${formatEta(arrival.timeToStation)}`);
  }

  const station = {
    id: schedule.stationId,
    crs: schedule.crs || "",
    name: schedule.title,
  };
  const allArrivals = await getTrainArrivalsForLine(station, schedule.lineId);
  const usesDepartureBoard = schedule.lineId === "national-rail" && schedule.crs || shouldUseNationalRailDeparturesForLine(station, schedule.lineId);
  const arrivals = (usesDepartureBoard
    ? allArrivals
    : filterArrivalsByLine(allArrivals, schedule.lineId)
  )
    .filter((arrival) => !schedule.destination || cleanStationName(arrival.destinationName || "") === schedule.destination)
    .slice(0, 3);

  return arrivals.map((arrival) => `${arrival.lineName || schedule.lineName} ${cleanStationName(arrival.destinationName || "")} ${formatEta(arrival.timeToStation)}`);
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

function registerSchedulerWakeHandlers() {
  const checkSchedules = () => {
    runDueSchedules().finally(() => {
      scheduleSavedNotifications();
      if (state.activePage === "scheduler") refreshSchedulerUi();
    });
  };

  window.addEventListener("focus", checkSchedules);
  window.addEventListener("pageshow", checkSchedules);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkSchedules();
  });
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
