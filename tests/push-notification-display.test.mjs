import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

test("server pushes use distinct reminder tags and request an alert on replacement", async () => {
  const listeners = {};
  const notifications = [];
  const self = { addEventListener: (type, handler) => { listeners[type] = handler; },
    registration: { showNotification: async (title, options) => { notifications.push({ title, options }); } },
    location: { origin: "https://example.test" } };
  vm.runInNewContext(await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8"), { self, URL });
  for (const tag of ["schedule-first", "schedule-second"]) {
    let pending;
    listeners.push({ data: { json: () => ({ title: "Reminder", body: "Bus", tag }) }, waitUntil: (promise) => { pending = promise; } });
    await pending;
  }
  assert.equal(notifications[0].options.tag, "schedule-first");
  assert.equal(notifications[1].options.tag, "schedule-second");
  assert.equal(notifications[0].options.renotify, true);
});
