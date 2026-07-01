const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "127.0.0.1";
const TFL_API_BASE = "https://api.tfl.gov.uk";
const TFL_ALLOWED_QUERY_PARAMS = new Set(["lat", "lon", "stopTypes", "modes", "radius", "page", "lineIds", "direction"]);
const PUBLIC_FILES = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/icon.svg",
  "/icon-maskable.svg",
]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};
let catalogApi = null;
let nationalRailApi = null;

loadEnv();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/national-rail/arrivals") {
      await handleNationalRailArrivals(url, response);
      return;
    }

    if (url.pathname === "/api/national-rail/config") {
      sendJson(response, 200, {
        configured: Boolean(getConfiguredToken()),
        portalCredentialsConfigured: Boolean(process.env.NATIONAL_RAIL_USERNAME && process.env.NATIONAL_RAIL_PASSWORD),
      });
      return;
    }

    if (url.pathname === "/api/tfl" || url.pathname.startsWith("/api/tfl/")) {
      await handleTflProxy(url, response);
      return;
    }

    if (url.pathname === "/api/catalog/bus-stops") {
      const { getCachedBusStops } = await getCatalogApi();
      sendJson(response, 200, await getCachedBusStops(process.env));
      return;
    }

    if (url.pathname === "/api/catalog/train-stations") {
      const { getCachedTrainStations } = await getCatalogApi();
      sendJson(response, 200, await getCachedTrainStations(process.env));
      return;
    }

    serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Live arrivals server running at http://${HOST}:${PORT}/`);
});

async function handleTflProxy(url, response) {
  const upstreamUrl = buildTflProxyUrl(url);
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Accept: "application/json",
    },
  });
  response.writeHead(upstreamResponse.status, {
    "Content-Type": upstreamResponse.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(await upstreamResponse.text());
}

function buildTflProxyUrl(url) {
  const path = url.pathname.slice("/api/tfl".length) || "/";
  if (!isAllowedTflPath(path)) {
    throw new Error("TfL endpoint is not allowed by this app.");
  }

  const upstreamUrl = new URL(`${TFL_API_BASE}${path}`);
  url.searchParams.forEach((value, key) => {
    if (!TFL_ALLOWED_QUERY_PARAMS.has(key)) return;
    upstreamUrl.searchParams.set(key, value.slice(0, 300));
  });
  if (process.env.TFL_APP_KEY) upstreamUrl.searchParams.set("app_key", process.env.TFL_APP_KEY);
  if (process.env.TFL_APP_ID) upstreamUrl.searchParams.set("app_id", process.env.TFL_APP_ID);
  return upstreamUrl;
}

function isAllowedTflPath(pathname) {
  return [
    /^\/StopPoint$/,
    /^\/StopPoint\/Mode\/[a-z0-9,-]+$/i,
    /^\/StopPoint\/Search\/[^/]+$/i,
    /^\/StopPoint\/[^/]+\/Arrivals$/i,
    /^\/Place\/Search\/[^/]+$/i,
    /^\/Line\/[^/]+\/Status$/i,
  ].some((pattern) => pattern.test(pathname));
}

function loadEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key]) return;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  });
}

function getConfiguredToken() {
  return process.env.NATIONAL_RAIL_DARWIN_TOKEN || process.env.NATIONAL_RAIL_TOKEN || "";
}

async function getCatalogApi() {
  if (!catalogApi) {
    catalogApi = import("./functions/api/catalog/shared.mjs");
  }
  return catalogApi;
}

async function getNationalRailApi() {
  if (!nationalRailApi) {
    nationalRailApi = import("./functions/api/national-rail/arrivals.js");
  }
  return nationalRailApi;
}

function serveStatic(pathname, response) {
  const publicPath = pathname === "/" ? "/index.html" : pathname;
  if (!PUBLIC_FILES.has(publicPath)) {
    sendText(response, 404, "Not found");
    return;
  }

  const filePath = path.join(ROOT, publicPath);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  });
}

async function handleNationalRailArrivals(url, response) {
  const { onRequestGet } = await getNationalRailApi();
  const workerResponse = await onRequestGet({
    request: new Request(url.href),
    env: process.env,
  });
  response.writeHead(workerResponse.status, {
    "Content-Type": workerResponse.headers.get("content-type") || "application/json; charset=utf-8",
    "Cache-Control": workerResponse.headers.get("cache-control") || "no-store",
  });
  response.end(await workerResponse.text());
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(text);
}
