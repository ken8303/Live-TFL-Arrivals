const DARWIN_ENDPOINT = "https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb11.asmx";
const DARWIN_DEPARTURE_SOAP_ACTION = "http://thalesgroup.com/RTTI/2015-05-14/ldb/GetDepBoardWithDetails";
const LONDON_TIME_ZONE = "Europe/London";
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

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const crs = (url.searchParams.get("crs") || "").trim().toUpperCase();
    const rows = Math.min(Math.max(Number.parseInt(url.searchParams.get("rows") || "5", 10), 1), 10);
    const operator = normaliseOperatorFilter(url.searchParams.get("operator"));
    const includeElizabeth = operator === "elizabeth-line";
    const requestedRows = includeElizabeth ? 50 : rows;

    if (!/^[A-Z]{3}$/.test(crs)) {
      return json({ error: "A valid 3-letter station CRS code is required." }, 400);
    }

    const token = await getNationalRailToken(context.env);
    if (!token) {
      return json(
        {
          error: "National Rail live board token is not configured in Cloudflare.",
          help: "Add NATIONAL_RAIL_DARWIN_TOKEN. Username/password Data Portal credentials cannot be used for this live arrivals endpoint.",
        },
        501,
      );
    }

    if (!isDarwinToken(token)) {
      return json(
        {
          error: "National Rail live board token format looks invalid.",
          help: "NATIONAL_RAIL_DARWIN_TOKEN should be the OpenLDBWS token, usually in nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn format.",
        },
        401,
      );
    }

    const xml = await requestDepartureBoardWithDetails(crs, requestedRows, token);
    const services = parseDarwinServices(xml, requestedRows)
      .filter((service) => includeElizabeth ? isElizabethLineService(service) : !isElizabethLineService(service))
      .slice(0, rows);
    return json({
      source: "National Rail Darwin",
      board: "departures",
      crs,
      arrivals: services,
    });
  } catch (error) {
    console.error(error);
    return json(
      {
        error: "National Rail arrivals could not be loaded.",
        help: error.message || "Check the NATIONAL_RAIL_DARWIN_TOKEN value in Cloudflare Variables and Secrets.",
      },
      502,
    );
  }
}

async function getNationalRailToken(env) {
  return env.NATIONAL_RAIL_DARWIN_TOKEN || env.NATIONAL_RAIL_TOKEN || "";
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

  const response = await fetch(DARWIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: DARWIN_DEPARTURE_SOAP_ACTION,
    },
    body: envelope,
  });
  const text = await response.text();
  if (!response.ok || text.includes("<soap:Fault>")) {
    throw new Error(getDarwinFault(text) || `National Rail request failed with status ${response.status}`);
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
    const platform = getTagText(service, "platform");
    const serviceStatus = getServiceStatus(expected);

    return {
      modeName: "national-rail",
      lineId: "national-rail",
      lineName: getTagText(service, "operator") || "National Rail",
      destinationName: getDestinationName(service),
      platformName: platform ? `Platform ${platform}` : "",
      callingPoints: getCallingPoints(service),
      expectedArrival: getExpectedDate(expected, scheduled),
      scheduledArrival: getExpectedDate(scheduled, scheduled),
      timeToStation: getTimeToStation(expected, scheduled),
      serviceStatus,
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

function normaliseOperatorFilter(value) {
  const operator = String(value || "").trim().toLowerCase();
  return ["elizabeth", "elizabeth-line", "elizabeth line"].includes(operator) ? "elizabeth-line" : "";
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

function getServiceStatus(expected) {
  const value = String(expected || "").trim().toLowerCase();
  if (value === "cancelled") return "cancelled";
  if (value === "delayed") return "delayed";
  if (value === "on time") return "on-time";
  if (/^\d{2}:\d{2}$/.test(value)) return "estimated";
  return "scheduled";
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
  // London currently switches between GMT and BST, so these probes cover both possible UTC offsets.
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export { getServiceStatus, normaliseTime, parseDarwinServices };
