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
    vm.runInContext(functions("saveCurrentSchedule", "syncScheduleToServer"), ctx);
    await ctx.saveCurrentSchedule();
    assert.equal(ctx.state.savedSchedules.length, 1);
    assert.equal(statuses.at(-1).tone, ok ? "ready" : "waiting");
    if (!ok) assert.match(statuses.at(-1).message, /Server push could not be synced/);
  }
});

test("local and deployed frontend copies match", async () => {
  assert.equal(await readFile(new URL("../app.js", import.meta.url), "utf8"), source);
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
