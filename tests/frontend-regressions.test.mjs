import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
function functions(...names) {
  return names.map((name) => {
    const match = new RegExp(`^(?:async )?function ${name}\\(`, "m").exec(source);
    assert.ok(match, `Missing function ${name}`);
    const rest = source.slice(match.index);
    const next = /\n(?:async )?function /.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
  }).join("\n");
}
const noop = () => {};

test("train destination filtering precedes display limit and survives an empty refresh", async () => {
  let rendered = [];
  let arrivals = Array.from({ length: 6 }, (_, i) => ({ lineId: "elizabeth", timeToStation: (i + 1) * 60, destinationName: i === 5 ? "Reading" : "Paddington" }));
  const ctx = vm.createContext({
    state: { loading: false }, console, window: { setTimeout: noop },
    trainLineSelect: {}, selectedTrainTitle: {}, selectedTrainSubtitle: {}, lineStatusPanel: {}, selectedTrainPanel: {}, lastUpdated: {}, trainDestinationSelect: {},
    NATIONAL_RAIL_RESULTS: 10, SELECTED_TRAIN_ARRIVALS: 5,
    updateFavouriteButtons: noop, updateBookmarkUrl: noop, resetTrainDestinationSelect: noop,
    formatTrainBoardName: (x) => x, renderSkeletons: noop, setStatus: noop,
    getLineStatus: async () => null, getTrainResultLimit: () => 5,
    shouldUseNationalRailDeparturesForLine: () => false, isAfterDelay: () => true,
    renderLineStatus: noop, scheduleNextRefresh: noop, cleanStationName: (x) => x, escapeHtml: (x) => x,
    getTrainArrivalsForLine: async () => arrivals,
    renderSelectedTrainStation: (_station, values) => { rendered = values; },
    setTrainStationStatus: noop, updateScheduleButtons: noop,
  });
  vm.runInContext(functions("loadSelectedTrainLine", "syncTrainDestinationSelect", "getDestinationOptions", "filterArrivalsByLine", "filterArrivalsByDestination", "renderSelectedTrainWithFilters"), ctx);
  const station = { id: "test", name: "Test station" };
  await ctx.loadSelectedTrainLine(station, "elizabeth", "Reading");
  assert.equal(ctx.state.selectedTrainDestination, "Reading");
  assert.equal(rendered.length, 1);
  assert.equal(rendered[0].destinationName, "Reading");
  await ctx.loadSelectedTrainLine(station, "elizabeth", "");
  assert.equal(rendered.length, 5);
  arrivals = arrivals.slice(0, 5);
  await ctx.loadSelectedTrainLine(station, "elizabeth", "Reading");
  assert.equal(ctx.state.selectedTrainDestination, "Reading");
  assert.equal(rendered.length, 0);
});

test("failed server sync keeps its warning while successful saves confirm success", async () => {
  for (const ok of [false, true]) {
    const statuses = [];
    const ctx = vm.createContext({
      console: { warn: noop }, state: { schedulerDraft: { id: "test", title: "Bus" }, savedSchedules: [], serverPushConfigured: true, serverPushSubscription: { toJSON: () => ({}) } },
      window: { location: { href: "https://example.com/" } }, schedulerTimeInput: { value: "08:00" },
      getSelectedWeekdaysFromForm: () => [1], normaliseScheduleTimeStep: (x) => x,
      getSelectedNotificationMode: () => "all", persistSavedSchedules: noop, scheduleSavedNotifications: noop,
      refreshSchedulerUi: noop, updateBookmarkUrl: noop, getSameOriginPath: (x) => x,
      getPushDeviceToken: () => "test", fetch: async () => ({ ok, status: ok ? 200 : 503, json: async () => ({ error: "offline" }) }),
      setStatus: (message, tone) => statuses.push({ message, tone }),
    });
    vm.runInContext(functions("saveCurrentSchedule", "syncScheduleToServer", "getServerSyncSignature"), ctx);
    await ctx.saveCurrentSchedule();
    assert.equal(ctx.state.savedSchedules.length, 1);
    assert.equal(statuses.at(-1).tone, ok ? "ready" : "waiting");
    if (!ok) assert.match(statuses.at(-1).message, /Server push could not be synced/);
  }
});

test("failed reminder deletion retains the local schedule for retry", async () => {
  for (const outcome of ["http-error", "network-error", "success"]) {
    const schedule = { id: "delete-me", title: "Bus" };
    const statuses = [];
    const button = { dataset: { scheduleAction: "delete", scheduleId: schedule.id } };
    const ctx = vm.createContext({
      state: { savedSchedules: [schedule], serverPushSubscription: { endpoint: "https://example.test/push" } },
      console: { warn: noop }, getPushDeviceToken: () => "token",
      fetch: async () => {
        if (outcome === "network-error") throw new Error("offline");
        return { ok: outcome === "success", status: 503, json: async () => ({ error: "Try again" }) };
      },
      persistSavedSchedules: noop, scheduleSavedNotifications: noop, refreshSchedulerUi: noop,
      setStatus: (text, tone) => statuses.push({ text, tone }),
    });
    vm.runInContext(functions("handleSavedSchedulesClick", "syncDeletedScheduleToServer"), ctx);
    await ctx.handleSavedSchedulesClick({ target: { closest: () => button } });
    assert.equal(ctx.state.savedSchedules.length, outcome === "success" ? 0 : 1);
    assert.equal(statuses.at(-1).tone, outcome === "success" ? "ready" : "error");
    assert.equal(button.disabled, false);
  }
});

test("overlapping scheduler wakeups deliver a due reminder only once", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  let sends = 0;
  const schedule = { id: "morning" };
  const ctx = vm.createContext({
    state: { savedSchedules: [schedule] }, SCHEDULE_CATCHUP_MS: 600_000,
    getPreviousScheduleTime: () => new Date(Date.now() - 1000),
    sendScheduleNotification: async () => { sends++; await pending; return true; },
    persistSavedSchedules: noop, renderSavedSchedules: noop,
  });
  vm.runInContext(functions("runDueSchedules"), ctx);
  const first = ctx.runDueSchedules();
  const second = ctx.runDueSchedules();
  release();
  await Promise.all([first, second]);
  assert.equal(sends, 1);
  assert.ok(schedule.lastFiredAt);
});

test("failed local delivery remains eligible for retry", async () => {
  const schedule = { id: "morning" };
  let delivered = false;
  const ctx = vm.createContext({
    state: { savedSchedules: [schedule] }, SCHEDULE_CATCHUP_MS: 600_000,
    getPreviousScheduleTime: () => new Date(Date.now() - 1000),
    sendScheduleNotification: async () => delivered,
    persistSavedSchedules: noop, renderSavedSchedules: noop,
  });
  vm.runInContext(functions("runDueSchedules"), ctx);
  await ctx.runDueSchedules();
  assert.equal(schedule.lastFiredAt, undefined);
  delivered = true;
  await ctx.runDueSchedules();
  assert.ok(schedule.lastFiredAt);
});

test("loading malformed saved schedules keeps valid reminders and discards unusable entries", () => {
  const valid = { id: "valid", type: "bus", title: "Morning", time: "08:00", weekdays: [1, 2] };
  for (const raw of ["null", "{}", JSON.stringify([null, {}, { ...valid, weekdays: "Monday" }, valid])]) {
    const ctx = vm.createContext({ state: {}, SCHEDULE_STORAGE_KEY: "test", console,
      window: { localStorage: { getItem: () => raw } },
    });
    vm.runInContext(functions("loadSavedSchedules"), ctx);
    ctx.loadSavedSchedules();
    assert.ok(Array.isArray(ctx.state.savedSchedules));
    assert.equal(ctx.state.savedSchedules.length, raw.startsWith("[") ? 1 : 0);
  }
});

test("notification delivery reports failures and only saves alert state after success", async () => {
  const schedule = { title: "Morning", alertOnly: true, alertState: { platform: "1" } };
  let fail = true;
  const ctx = vm.createContext({
    window: { Notification: {}, location: { href: "https://example.test" } },
    Notification: { permission: "granted" }, console: { error: noop },
    fetchScheduleAlertLines: async () => ({ lines: ["Platform changed"], alertState: { platform: "2" } }),
    showAppNotification: async () => { if (fail) throw new Error("Delivery failed"); },
  });
  vm.runInContext(functions("sendScheduleNotification"), ctx);
  assert.equal(await ctx.sendScheduleNotification(schedule), false);
  assert.equal(schedule.alertState.platform, "1");
  fail = false;
  assert.equal(await ctx.sendScheduleNotification(schedule), true);
  assert.equal(schedule.alertState.platform, "2");
  ctx.Notification.permission = "denied";
  assert.equal(await ctx.sendScheduleNotification(schedule), false);
});

test("blocked local storage does not crash favourites, schedules or push token setup", () => {
  const failingStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const ctx = vm.createContext({ state: { savedSchedules: [], favourites: [] }, window: { localStorage: failingStorage },
    console: { error: noop }, SCHEDULE_STORAGE_KEY: "schedule", FAVOURITES_STORAGE_KEY: "favourites",
    PUSH_DEVICE_TOKEN_STORAGE_KEY: "device" });
  vm.runInContext(functions("persistSavedSchedules", "persistFavourites", "getPushDeviceToken"), ctx);
  assert.equal(ctx.persistSavedSchedules(), false);
  assert.equal(ctx.persistFavourites(), false);
  assert.equal(ctx.getPushDeviceToken(), "");
});

test("an unsaved local reminder is not registered for server push", async () => {
  let synced = false;
  const statuses = [];
  const ctx = vm.createContext({
    state: { schedulerDraft: { id: "test", title: "Bus" }, savedSchedules: [] },
    schedulerTimeInput: { value: "08:00" }, getSelectedWeekdaysFromForm: () => [1],
    normaliseScheduleTimeStep: (value) => value, getSelectedNotificationMode: () => "reminder",
    persistSavedSchedules: () => false, scheduleSavedNotifications: noop,
    syncScheduleToServer: async () => { synced = true; return true; },
    refreshSchedulerUi: noop, updateBookmarkUrl: noop,
    setStatus: (message, tone) => statuses.push({ message, tone }),
  });
  vm.runInContext(functions("saveCurrentSchedule"), ctx);
  await ctx.saveCurrentSchedule();
  assert.equal(synced, false);
  assert.equal(statuses.at(-1).tone, "error");
});

test("server test failures are reported instead of triggering a local success", async () => {
  for (const mode of ["http", "network", "success", "local"]) {
    let localCount = 0;
    const messages = [];
    const ctx = vm.createContext({
      state: { schedulerDraft: { title: "Bus" }, serverPushSubscription: mode === "local" ? null : { toJSON: () => ({}) } },
      window: { Notification: {}, location: { href: "https://example.test" } },
      Notification: { permission: "granted" }, console: { warn: noop },
      getPushDeviceToken: () => "token", getSameOriginPath: () => "/",
      fetch: async () => { if (mode === "network") throw new Error("offline"); return { ok: mode === "success", status: 502 }; },
      showAppNotification: async () => { localCount++; },
      setStatus: (message, tone) => messages.push({ message, tone }),
    });
    vm.runInContext(functions("sendTestNotification"), ctx);
    await ctx.sendTestNotification();
    assert.equal(localCount, mode === "local" ? 1 : 0);
    assert.equal(messages.at(-1).tone, mode === "success" ? "ready" : mode === "local" ? "waiting" : "error");
  }
});

test("push subscriptions are renewed for changed keys and restored when missing", async () => {
  for (const mode of ["changed", "same", "missing", "unknown"]) {
    let unsubscribeCount = 0, subscribeCount = 0, syncCount = 0;
    const key = new Uint8Array([1, 2, 3]);
    const old = { options: mode === "unknown" ? {} : { applicationServerKey: new Uint8Array(mode === "changed" ? [4, 5, 6] : [1, 2, 3]).buffer },
      unsubscribe: async () => { unsubscribeCount++; return true; } };
    const fresh = { options: { applicationServerKey: key.buffer } };
    const registration = { pushManager: { getSubscription: async () => mode === "missing" ? null : old,
      subscribe: async () => { subscribeCount++; return fresh; } } };
    const ctx = vm.createContext({ state: { serverPushConfigured: true, serverPushPublicKey: "key" },
      waitForServiceWorkerReady: async () => registration, urlBase64ToUint8Array: () => key,
      syncAllSchedulesToServer: async () => { syncCount++; }, Uint8Array });
    vm.runInContext(functions("subscribeToServerPush"), ctx);
    await ctx.subscribeToServerPush();
    assert.equal(unsubscribeCount, mode === "changed" ? 1 : 0);
    assert.equal(subscribeCount, ["changed", "missing"].includes(mode) ? 1 : 0);
    assert.equal(syncCount, 1);
  }
});

test("startup restores a missing subscription when permission is granted", async () => {
  let renewed = 0;
  const ctx = vm.createContext({ state: { savedSchedules: [{ id: "bus" }] },
    navigator: { serviceWorker: {} }, window: { PushManager: {}, Notification: {} }, Notification: { permission: "granted" },
    fetchJson: async () => ({ configured: true, publicKey: "key" }),
    waitForServiceWorkerReady: async () => ({ pushManager: { getSubscription: async () => null } }),
    subscribeToServerPush: async () => { renewed++; }, syncAllSchedulesToServer: noop,
    refreshSchedulerUi: noop, console });
  vm.runInContext(functions("initServerPush"), ctx);
  await ctx.initServerPush();
  assert.equal(renewed, 1);
});

test("background sync reports partial failures", async () => {
  const messages = [];
  const ctx = vm.createContext({ state: { serverPushSubscription: {}, savedSchedules: [{ id: "a" }, { id: "b" }] },
    syncScheduleToServer: async (s) => s.id === "a", setStatus: (message, tone) => messages.push({ message, tone }) });
  vm.runInContext(functions("syncAllSchedulesToServer"), ctx);
  assert.equal(await ctx.syncAllSchedulesToServer(), false);
  assert.equal(ctx.state.serverPushSyncFailed, true);
  assert.equal(messages.at(-1).tone, "error");
});

test("local delivery runs only when the matching server sync has not succeeded", async () => {
  const schedule = { id: "morning", updatedAt: "first" };
  let count = 0;
  const ctx = vm.createContext({ state: { savedSchedules: [schedule], serverPushSubscription: { endpoint: "test" }, serverSyncedSchedules: {} },
    SCHEDULE_CATCHUP_MS: 600_000, getPreviousScheduleTime: () => new Date(Date.now() - 1000),
    sendScheduleNotification: async () => { count++; return true; }, persistSavedSchedules: noop, renderSavedSchedules: noop });
  vm.runInContext(functions("runDueSchedules", "getServerSyncSignature"), ctx);
  ctx.state.serverSyncedSchedules.morning = ctx.getServerSyncSignature(schedule);
  await ctx.runDueSchedules();
  assert.equal(count, 0);
  schedule.updatedAt = "edited";
  await ctx.runDueSchedules();
  assert.equal(count, 1);
});
