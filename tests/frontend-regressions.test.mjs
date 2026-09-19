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
