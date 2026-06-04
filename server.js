const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "127.0.0.1";
const DARWIN_ENDPOINT = "https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb11.asmx";
const DATA_PORTAL_AUTH_URL = "https://opendata.nationalrail.co.uk/authenticate";
const PUBLIC_FILES = new Set(["/", "/index.html", "/styles.css", "/app.js"]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

let cachedPortalToken = null;

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
        configured: Boolean(getConfiguredToken() || (process.env.NATIONAL_RAIL_USERNAME && process.env.NATIONAL_RAIL_PASSWORD)),
      });
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
  const crs = (url.searchParams.get("crs") || "").trim().toUpperCase();
  const rows = Math.min(Math.max(Number.parseInt(url.searchParams.get("rows") || "5", 10), 1), 10);

  if (!/^[A-Z]{3}$/.test(crs)) {
    sendJson(response, 400, { error: "A valid 3-letter station CRS code is required." });
    return;
  }

  const token = await getNationalRailToken();
  if (!token) {
    sendJson(response, 501, {
      error: "National Rail credentials are not configured on the server.",
      help: "Copy .env.example to .env, add your token or username/password, then restart the server.",
    });
    return;
  }

  const xml = await requestArrivalBoard(crs, rows, token);
  sendJson(response, 200, {
    source: "National Rail Darwin",
    crs,
    arrivals: parseDarwinServices(xml, rows),
  });
}

function getConfiguredToken() {
  return process.env.NATIONAL_RAIL_DARWIN_TOKEN || process.env.NATIONAL_RAIL_TOKEN || "";
}

async function getNationalRailToken() {
  const configuredToken = getConfiguredToken();
  if (configuredToken) return configuredToken;

  const username = process.env.NATIONAL_RAIL_USERNAME;
  const password = process.env.NATIONAL_RAIL_PASSWORD;
  if (!username || !password) return "";

  if (cachedPortalToken && cachedPortalToken.expiresAt > Date.now() + 60_000) {
    return cachedPortalToken.value;
  }

  const body = new URLSearchParams({ username, password });
  const authResponse = await fetch(DATA_PORTAL_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await authResponse.json();
  if (!authResponse.ok || !data.token) return "";

  cachedPortalToken = {
    value: data.token,
    expiresAt: getPortalTokenExpiry(data.token),
  };
  return cachedPortalToken.value;
}

function getPortalTokenExpiry(token) {
  const expires = Number(String(token).split(":")[1]);
  return Number.isFinite(expires) ? expires : Date.now() + 10 * 60_000;
}

async function requestArrivalBoard(crs, rows, token) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://thalesgroup.com/RTTI/2013-11-28/Token/types" xmlns:ldb="http://thalesgroup.com/RTTI/2017-10-01/ldb/">
  <soap:Header>
    <typ:AccessToken>
      <typ:TokenValue>${escapeXml(token)}</typ:TokenValue>
    </typ:AccessToken>
  </soap:Header>
  <soap:Body>
    <ldb:GetArrivalBoardRequest>
      <ldb:numRows>${rows}</ldb:numRows>
      <ldb:crs>${escapeXml(crs)}</ldb:crs>
    </ldb:GetArrivalBoardRequest>
  </soap:Body>
</soap:Envelope>`;

  const nationalRailResponse = await fetch(DARWIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://thalesgroup.com/RTTI/2017-10-01/ldb/GetArrivalBoard",
    },
    body: envelope,
  });

  const text = await nationalRailResponse.text();
  if (!nationalRailResponse.ok || text.includes("<soap:Fault>")) {
    throw new Error("National Rail request failed");
  }

  return text;
}

function parseDarwinServices(xml, rows) {
  const serviceBlocks = xml.match(/<[^<>:]*:?service\b[\s\S]*?<\/[^<>:]*:?service>/g) || [];
  return serviceBlocks.slice(0, rows).map((service) => {
    const expected = getTagText(service, "eta") || getTagText(service, "sta") || getTagText(service, "etd") || getTagText(service, "std");
    const scheduled = getTagText(service, "sta") || getTagText(service, "std");
    const destinationName = getTagText(service, "locationName") || getTagText(service, "destination") || "Destination unavailable";

    return {
      modeName: "national-rail",
      lineId: "national-rail",
      lineName: getTagText(service, "operator") || "National Rail",
      destinationName,
      platformName: getTagText(service, "platform") ? `Platform ${getTagText(service, "platform")}` : "",
      expectedArrival: getExpectedDate(expected, scheduled),
      timeToStation: getTimeToStation(expected, scheduled),
    };
  });
}

function getTagText(xml, tag) {
  const match = xml.match(new RegExp(`<[^<>:]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^<>:]*:?${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : "";
}

function getExpectedDate(expected, scheduled) {
  const timeText = normaliseTime(expected, scheduled);
  if (!timeText) return null;
  const [hours, minutes] = timeText.split(":").map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() < Date.now() - 60 * 60_000) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

function getTimeToStation(expected, scheduled) {
  const iso = getExpectedDate(expected, scheduled);
  if (!iso) return Number.NaN;
  return Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
}

function normaliseTime(expected, scheduled) {
  if (/^\d{2}:\d{2}$/.test(expected)) return expected;
  if (expected && expected.toLowerCase() === "on time" && /^\d{2}:\d{2}$/.test(scheduled)) return scheduled;
  if (/^\d{2}:\d{2}$/.test(scheduled)) return scheduled;
  return "";
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&apos;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
}

function sendText(response, status, text) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  response.end(text);
}
