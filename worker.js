import { onRequestGet as getNationalRailArrivals } from "./functions/api/national-rail/arrivals.js";
import { onRequestGet as getNationalRailConfig } from "./functions/api/national-rail/config.js";
import { onRequestGet as getBusStopsCatalog } from "./functions/api/catalog/bus-stops.js";
import { onRequestGet as getTrainStationsCatalog } from "./functions/api/catalog/train-stations.js";
import { onRequestGet as getReadingBusPredictions } from "./functions/api/reading-buses/predictions.js";
import { onRequestGet as getReadingBusLines } from "./functions/api/reading-buses/lines.js";

const APP_VERSION = "2026-06-10-readingpredictions";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/national-rail/arrivals") {
      return withVersionHeader(await getNationalRailArrivals({ request, env }));
    }

    if (url.pathname === "/api/national-rail/config") {
      return withVersionHeader(await getNationalRailConfig({ request, env }));
    }

    if (url.pathname === "/api/catalog/bus-stops") {
      return withVersionHeader(await getBusStopsCatalog({ request, env }));
    }

    if (url.pathname === "/api/catalog/train-stations") {
      return withVersionHeader(await getTrainStationsCatalog({ request, env }));
    }

    if (url.pathname === "/api/reading-buses/predictions") {
      return withVersionHeader(await getReadingBusPredictions({ request, env }));
    }

    if (url.pathname === "/api/reading-buses/lines") {
      return withVersionHeader(await getReadingBusLines({ request, env }));
    }

    if (url.pathname === "/api/version") {
      return withVersionHeader(
        Response.json({
          appVersion: APP_VERSION,
          workerName: "live-tfl-arrivals",
        }),
      );
    }

    return withVersionHeader(await env.ASSETS.fetch(request));
  },
};

function withVersionHeader(response) {
  const headers = new Headers(response.headers);
  headers.set("x-app-version", APP_VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
