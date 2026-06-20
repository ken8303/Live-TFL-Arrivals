import test from "node:test";
import assert from "node:assert/strict";

import {
  getServiceStatus,
  normaliseTime,
  parseDarwinServices,
} from "../functions/api/national-rail/arrivals.js";

test("Darwin service states are preserved", () => {
  assert.equal(getServiceStatus("Cancelled"), "cancelled");
  assert.equal(getServiceStatus("Delayed"), "delayed");
  assert.equal(getServiceStatus("On time"), "on-time");
  assert.equal(getServiceStatus("12:34"), "estimated");
});

test("scheduled time remains available for cancelled and delayed services", () => {
  assert.equal(normaliseTime("Cancelled", "12:34"), "12:34");
  assert.equal(normaliseTime("Delayed", "12:34"), "12:34");

  const xml = `
    <service>
      <std>12:34</std>
      <etd>Cancelled</etd>
      <operator>Example Rail</operator>
      <platform>4</platform>
      <destination><location><locationName>Oxford</locationName></location></destination>
      <subsequentCallingPoints>
        <callingPoint><locationName>Reading</locationName></callingPoint>
        <callingPoint><locationName>Oxford</locationName></callingPoint>
      </subsequentCallingPoints>
    </service>
  `;
  const [service] = parseDarwinServices(xml, 1);

  assert.equal(service.serviceStatus, "cancelled");
  assert.equal(service.platformName, "Platform 4");
  assert.equal(service.destinationName, "Oxford");
  assert.deepEqual(service.callingPoints, ["Reading", "Oxford"]);
  assert.ok(service.scheduledArrival);
  assert.ok(Number.isFinite(service.timeToStation));
});
