import { fetchReadingText } from "./shared.js";

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    if (!url.searchParams.get("location")) {
      return Response.json(
        {
          error: "Reading bus predictions need a location parameter.",
        },
        { status: 400 },
      );
    }

    const data = await fetchReadingText("/siri-sm", env, request.url);
    return Response.json({
      source: "Reading Buses Open Data",
      location: url.searchParams.get("location"),
      arrivals: normaliseReadingPredictions(data),
    });
  } catch (error) {
    return Response.json(
      {
        error: "Reading bus predictions could not be loaded.",
        help: error.message,
      },
      { status: 500 },
    );
  }
}

function normaliseReadingPredictions(payload) {
  if (typeof payload === "string") {
    return normaliseReadingSiriXml(payload);
  }

  const items = findPredictionItems(payload);
  return items
    .map((item) => normalisePrediction(item))
    .filter(Boolean)
    .sort((a, b) => a.timeToStation - b.timeToStation);
}

function normaliseReadingSiriXml(xml) {
  return [...xml.matchAll(/<MonitoredStopVisit\b[\s\S]*?<\/MonitoredStopVisit>/gi)]
    .map((match) => normaliseSiriVisit(match[0]))
    .filter(Boolean)
    .sort((a, b) => a.timeToStation - b.timeToStation);
}

function normaliseSiriVisit(visitXml) {
  const expectedTime =
    getXmlText(visitXml, "ExpectedDepartureTime") ||
    getXmlText(visitXml, "ExpectedArrivalTime") ||
    getXmlText(visitXml, "AimedDepartureTime") ||
    getXmlText(visitXml, "AimedArrivalTime");
  const timeToStation = getSecondsUntil(expectedTime);
  if (!Number.isFinite(timeToStation)) return null;

  return {
    modeName: "bus",
    lineId: getXmlText(visitXml, "LineRef") || getXmlText(visitXml, "PublishedLineName") || "bus",
    lineName: getXmlText(visitXml, "PublishedLineName") || getXmlText(visitXml, "LineRef") || "Bus",
    destinationName: getXmlText(visitXml, "DestinationName") || getXmlText(visitXml, "DestinationRef") || "Destination",
    platformName: getXmlText(visitXml, "StopPointName") || "",
    expectedArrival: expectedTime,
    timeToStation,
  };
}

function getXmlText(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) return "";
  return decodeXml(match[1].replace(/<[^>]+>/g, "").trim());
}

function getSecondsUntil(value) {
  const parsedTime = Date.parse(value);
  if (!Number.isFinite(parsedTime)) return Number.NaN;
  return Math.max(0, Math.round((parsedTime - Date.now()) / 1000));
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function findPredictionItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const directArrays = [
    payload.data,
    payload.predictions,
    payload.departures,
    payload.services,
    payload.items,
    payload.result,
  ];
  for (const value of directArrays) {
    if (Array.isArray(value)) return value;
  }

  const nestedCandidates = [
    payload.stopMonitoringDelivery,
    payload.StopMonitoringDelivery,
    payload.ServiceDelivery?.StopMonitoringDelivery,
    payload.Siri?.ServiceDelivery?.StopMonitoringDelivery,
  ].flat().filter(Boolean);

  for (const candidate of nestedCandidates) {
    if (Array.isArray(candidate?.monitoredStopVisit)) return candidate.monitoredStopVisit;
    if (Array.isArray(candidate?.MonitoredStopVisit)) return candidate.MonitoredStopVisit;
  }

  return [];
}

function normalisePrediction(item) {
  const lineName =
    item.lineName ||
    item.lineRef ||
    item.serviceName ||
    item.service ||
    item.publishedLineName ||
    item.MonitoredVehicleJourney?.PublishedLineName ||
    item.MonitoredVehicleJourney?.LineRef ||
    "";

  const destinationName =
    item.destinationName ||
    item.destination ||
    item.destinationRef ||
    item.direction ||
    item.MonitoredVehicleJourney?.DestinationName ||
    item.MonitoredVehicleJourney?.DestinationRef ||
    "";

  const aimedTime =
    item.expectedDepartureTime ||
    item.expectedArrivalTime ||
    item.aimedDepartureTime ||
    item.aimedArrivalTime ||
    item.MonitoredVehicleJourney?.MonitoredCall?.ExpectedDepartureTime ||
    item.MonitoredVehicleJourney?.MonitoredCall?.ExpectedArrivalTime ||
    item.MonitoredVehicleJourney?.MonitoredCall?.AimedDepartureTime ||
    item.MonitoredVehicleJourney?.MonitoredCall?.AimedArrivalTime ||
    item.MonitoredVehicleJourney?.MonitoredCall?.ExpectedDepartureTime ||
    "";

  const timeToStation = getTimeToStation(item, aimedTime);
  if (!Number.isFinite(timeToStation)) return null;

  return {
    modeName: "bus",
    lineId: String(lineName || "bus"),
    lineName: String(lineName || "Bus"),
    destinationName: String(destinationName || "Destination"),
    platformName: item.platformName || item.stand || item.stopLetter || "",
    expectedArrival: aimedTime || null,
    timeToStation,
  };
}

function getTimeToStation(item, expectedTime) {
  const numericCandidates = [
    item.timeToStation,
    item.time_to_station,
    item.secondsToArrival,
    item.seconds_to_arrival,
    item.secondsToDeparture,
    item.seconds_to_departure,
    item.MonitoredVehicleJourney?.MonitoredCall?.Extensions?.Distances?.PresentableDistance,
  ];

  for (const value of numericCandidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  const minuteCandidates = [
    item.minutes,
    item.minutesToArrival,
    item.minutes_to_arrival,
    item.estimatedWait,
    item.bestDepartureEstimate,
  ];

  for (const value of minuteCandidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed * 60;
  }

  if (expectedTime) {
    const parsedTime = Date.parse(expectedTime);
    if (Number.isFinite(parsedTime)) {
      return Math.max(0, Math.round((parsedTime - Date.now()) / 1000));
    }
  }

  return Number.NaN;
}
