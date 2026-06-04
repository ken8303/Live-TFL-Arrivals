const DARWIN_ENDPOINT = "https://lite.realtime.nationalrail.co.uk/OpenLDBWS/ldb11.asmx";
const DATA_PORTAL_AUTH_URL = "https://opendata.nationalrail.co.uk/authenticate";

export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const crs = (url.searchParams.get("crs") || "").trim().toUpperCase();
    const rows = Math.min(Math.max(Number.parseInt(url.searchParams.get("rows") || "5", 10), 1), 10);

    if (!/^[A-Z]{3}$/.test(crs)) {
      return json({ error: "A valid 3-letter station CRS code is required." }, 400);
    }

    const token = await getNationalRailToken(context.env);
    if (!token) {
      return json(
        {
          error: "National Rail credentials are not configured in Cloudflare.",
          help: "Add NATIONAL_RAIL_DARWIN_TOKEN, or NATIONAL_RAIL_USERNAME and NATIONAL_RAIL_PASSWORD, in Cloudflare Pages settings.",
        },
        501,
      );
    }

    const xml = await requestArrivalBoard(crs, rows, token);
    return json({
      source: "National Rail Darwin",
      crs,
      arrivals: parseDarwinServices(xml, rows),
    });
  } catch (error) {
    console.error(error);
    return json({ error: "National Rail arrivals could not be loaded." }, 502);
  }
}

async function getNationalRailToken(env) {
  const configuredToken = env.NATIONAL_RAIL_DARWIN_TOKEN || env.NATIONAL_RAIL_TOKEN || "";
  if (configuredToken) return configuredToken;

  if (!env.NATIONAL_RAIL_USERNAME || !env.NATIONAL_RAIL_PASSWORD) return "";

  const body = new URLSearchParams({
    username: env.NATIONAL_RAIL_USERNAME,
    password: env.NATIONAL_RAIL_PASSWORD,
  });
  const response = await fetch(DATA_PORTAL_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  return response.ok ? data.token || "" : "";
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

  const response = await fetch(DARWIN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "http://thalesgroup.com/RTTI/2017-10-01/ldb/GetArrivalBoard",
    },
    body: envelope,
  });
  const text = await response.text();
  if (!response.ok || text.includes("<soap:Fault>")) throw new Error("National Rail request failed");
  return text;
}

function parseDarwinServices(xml, rows) {
  const serviceBlocks = xml.match(/<[^<>:]*:?service\b[\s\S]*?<\/[^<>:]*:?service>/g) || [];
  return serviceBlocks.slice(0, rows).map((service) => {
    const expected = getTagText(service, "eta") || getTagText(service, "sta") || getTagText(service, "etd") || getTagText(service, "std");
    const scheduled = getTagText(service, "sta") || getTagText(service, "std");
    const platform = getTagText(service, "platform");

    return {
      modeName: "national-rail",
      lineId: "national-rail",
      lineName: getTagText(service, "operator") || "National Rail",
      destinationName: getDestinationName(service),
      platformName: platform ? `Platform ${platform}` : "",
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
  return getTagText(destinationBlock, "locationName") || "Destination unavailable";
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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
