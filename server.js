const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8000;
const HOST = process.env.HOST || "127.0.0.1";
const DARWIN_ENDPOINT = "https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb11.asmx";
const DARWIN_DEPARTURE_SOAP_ACTION = "http://thalesgroup.com/RTTI/2015-05-14/ldb/GetDepBoardWithDetails";
const LONDON_TIME_ZONE = "Europe/London";
const PUBLIC_FILES = new Set(["/", "/index.html", "/styles.css", "/app.js"]);
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};
const londonDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const londonDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

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
      error: "National Rail live board token is not configured on the server.",
      help: "Add NATIONAL_RAIL_DARWIN_TOKEN. Username/password Data Portal credentials cannot be used for this live arrivals endpoint.",
    });
    return;
  }

  if (!isDarwinToken(token)) {
    sendJson(response, 401, {
      error: "National Rail live board token format looks invalid.",
      help: "NATIONAL_RAIL_DARWIN_TOKEN should be the OpenLDBWS token, usually in nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn format.",
    });
    return;
  }

  const xml = await requestDepartureBoardWithDetails(crs, rows, token);
  sendJson(response, 200, {
    source: "National Rail Darwin",
    board: "departures",
    crs,
    arrivals: parseDarwinServices(xml, rows).filter((service) => !isElizabethLineService(service)),
  });
}

function getConfiguredToken() {
  return process.env.NATIONAL_RAIL_DARWIN_TOKEN || process.env.NATIONAL_RAIL_TOKEN || "";
}

async function getNationalRailToken() {
  return getConfiguredToken();
}

async function requestDepartureBoardWithDetails(crs, rows, token) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:typ="http://thalesgroup.com/RTTI/2013-11-28/Token/types" xmlns:ldb="http://thalesgroup.com/RTTI/2017-10-01/ldb/">
  <soap:Header>
    <typ:AccessToken>
      <typ:TokenValue>${escapeXml(token)}</typ:TokenValue>
    </typ:AccessToken>
  </soap:Header>
  <soap:Body>
    <ldb:GetDepBoardWithDetailsRequest>
      <ldb:numRows>${rows}</ldb:numRows>
      <ldb:crs>${escapeXml(crs)}</ldb:crs>
      <ldb:filterCrs></ldb:filterCrs>
      <ldb:filterType>to</ldb:filterType>
      <ldb:timeOffset>0</ldb:timeOffset>
      <ldb:timeWindow>120</ldb:timeWindow>
    </ldb:GetDepBoardWithDetailsRequest>
  </soap:Body>
</soap:Envelope>`;

  const nationalRailResponse = await fetch(DARWIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: DARWIN_DEPARTURE_SOAP_ACTION,
    },
    body: envelope,
  });

  const text = await nationalRailResponse.text();
  if (!nationalRailResponse.ok || text.includes("<soap:Fault>")) {
    throw new Error(getDarwinFault(text) || `National Rail request failed with status ${nationalRailResponse.status}`);
  }

  return text;
}

function isDarwinToken(token) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(token).trim());
}

function getDarwinFault(xml) {
  return getTagText(xml, "faultstring") || getTagText(xml, "Text") || "";
}

function parseDarwinServices(xml, rows) {
  const serviceBlocks = xml.match(/<[^<>:]*:?service\b[\s\S]*?<\/[^<>:]*:?service>/g) || [];
  return serviceBlocks.slice(0, rows).map((service) => {
    const expected = getTagText(service, "etd") || getTagText(service, "std");
    const scheduled = getTagText(service, "std");
    const destinationName = getDestinationName(service);

    return {
      modeName: "national-rail",
      lineId: "national-rail",
      lineName: getTagText(service, "operator") || "National Rail",
      destinationName,
      platformName: getTagText(service, "platform") ? `Platform ${getTagText(service, "platform")}` : "",
      callingPoints: getCallingPoints(service),
      expectedArrival: getExpectedDate(expected, scheduled),
      timeToStation: getTimeToStation(expected, scheduled),
    };
  });
}

function getTagText(xml, tag) {
  const match = xml.match(new RegExp(`<[^<>:]*:?${tag}[^>]*>([\\s\\S]*?)<\\/[^<>:]*:?${tag}>`, "i"));
  return match ? decodeXml(match[1].replace(/<[^>]+>/g, "").trim()) : "";
}

function getDestinationName(service) {
  const destinationBlock = service.match(/<[^<>:]*:?destination\b[\s\S]*?<\/[^<>:]*:?destination>/i)?.[0] || "";
  const locationBlocks = destinationBlock.match(/<[^<>:]*:?location\b[\s\S]*?<\/[^<>:]*:?location>/gi) || [];
  return getTagText(locationBlocks.at(-1) || destinationBlock, "locationName") || "Destination unavailable";
}

function getCallingPoints(service) {
  const callingPointBlocks = service.match(/<[^<>:]*:?callingPoint\b[\s\S]*?<\/[^<>:]*:?callingPoint>/gi) || [];
  return callingPointBlocks
    .map((block) => getTagText(block, "locationName"))
    .filter(Boolean);
}

function isElizabethLineService(service) {
  return String(service.lineName || "").trim().toLowerCase() === "elizabeth line";
}

function getExpectedDate(expected, scheduled) {
  const timeText = normaliseTime(expected, scheduled);
  if (!timeText) return null;
  const now = new Date();
  const today = getLondonDateParts(now);
  const tomorrow = getLondonDateParts(new Date(now.getTime() + 24 * 60 * 60_000));
  const todayIso = getLondonOccurrenceIso(today, timeText);

  if (todayIso && new Date(todayIso).getTime() >= now.getTime() - 60 * 60_000) {
    return todayIso;
  }

  return getLondonOccurrenceIso(tomorrow, timeText);
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

function getLondonDateParts(date) {
  const parts = londonDateFormatter.formatToParts(date);
  return {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value),
  };
}

function getLondonOccurrenceIso(dateParts, timeText) {
  const [hours, minutes] = timeText.split(":").map(Number);
  for (const offsetMinutes of [0, 60]) {
    const candidateUtc = Date.UTC(
      dateParts.year,
      dateParts.month - 1,
      dateParts.day,
      hours - offsetMinutes / 60,
      minutes,
      0,
      0,
    );

    if (matchesLondonDateTime(candidateUtc, dateParts, timeText)) {
      return new Date(candidateUtc).toISOString();
    }
  }

  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hours, minutes, 0, 0)).toISOString();
}

function matchesLondonDateTime(candidateUtc, dateParts, timeText) {
  const parts = londonDateTimeFormatter.formatToParts(new Date(candidateUtc));
  const candidate = {
    day: Number(parts.find((part) => part.type === "day")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    year: Number(parts.find((part) => part.type === "year")?.value),
    hour: parts.find((part) => part.type === "hour")?.value,
    minute: parts.find((part) => part.type === "minute")?.value,
  };

  return (
    candidate.year === dateParts.year &&
    candidate.month === dateParts.month &&
    candidate.day === dateParts.day &&
    `${candidate.hour}:${candidate.minute}` === timeText
  );
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
