import { onRequestGet as getNationalRailArrivals } from "./functions/api/national-rail/arrivals.js";
import { onRequestGet as getNationalRailConfig } from "./functions/api/national-rail/config.js";
import { onRequestGet as getBusStopsCatalog } from "./functions/api/catalog/bus-stops.js";
import { onRequestGet as getTrainStationsCatalog } from "./functions/api/catalog/train-stations.js";
import { onRequestGet as getReadingBusPredictions } from "./functions/api/reading-buses/predictions.js";
import { onRequestGet as getReadingBusLines } from "./functions/api/reading-buses/lines.js";
import { onRequestGet as getTflApi } from "./functions/api/tfl.js";
import {
  deletePushSchedule,
  getPushPublicKey,
  runScheduledPush,
  savePushSchedule,
  sendPushTest,
} from "./functions/api/push.js";

const APP_VERSION = "2026-06-20-reliability";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/national-rail/arrivals") {
      return withVersionHeader(await getNationalRailArrivals({ request, env }));
    }

    if (url.pathname === "/api/tfl" || url.pathname.startsWith("/api/tfl/")) {
      return withVersionHeader(await getTflApi({ request, env }));
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

    if (url.pathname === "/api/push/public-key") {
      return withVersionHeader(await getPushPublicKey({ request, env }));
    }

    if (url.pathname === "/api/push/schedules" && request.method === "POST") {
      return withVersionHeader(await savePushSchedule({ request, env }));
    }

    if (url.pathname === "/api/push/schedules/delete" && request.method === "POST") {
      return withVersionHeader(await deletePushSchedule({ request, env }));
    }

    if (url.pathname === "/api/push/test" && request.method === "POST") {
      return withVersionHeader(await sendPushTest({ request, env }));
    }

    if (url.pathname === "/api/version") {
      return withVersionHeader(
        Response.json({
          appVersion: APP_VERSION,
          workerName: "live-tfl-arrivals",
        }),
      );
    }

    return withVersionHeader(await env.ASSETS.fetch(request), request);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runScheduledPush(controller, env));
  },
};

function withVersionHeader(response, request = null) {
  const headers = new Headers(response.headers);
  headers.set("x-app-version", APP_VERSION);
  if (shouldBypassBrowserCache(request)) {
    headers.set("Cache-Control", "no-store, max-age=0");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function shouldBypassBrowserCache(request) {
  if (!request) return false;
  const { pathname } = new URL(request.url);
  return pathname === "/" || pathname === "/index.html" || pathname === "/app.js" || pathname === "/service-worker.js";
}
