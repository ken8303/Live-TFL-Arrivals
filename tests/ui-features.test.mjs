import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("deployed app includes favourites, alert-only scheduling, and expandable calling points", async () => {
  const [html, app, styles, serviceWorker] = await Promise.all([
    readFile(new URL("public/index.html", root), "utf8"),
    readFile(new URL("public/app.js", root), "utf8"),
    readFile(new URL("public/styles.css", root), "utf8"),
    readFile(new URL("public/service-worker.js", root), "utf8"),
  ]);

  assert.match(html, /id="favouritesNavButton"/);
  assert.match(html, /name="notificationMode" value="alerts"/);
  assert.match(html, /app\.js\?v=2026-06-29-train-favourite/);
  assert.match(app, /function renderFavourites\(\)/);
  assert.match(app, /function loadFavouriteSchedules\(\)/);
  assert.match(app, /train:\$\{state\.selectedTrainStation\.id\}:\$\{state\.selectedTrainLine\}/);
  assert.match(app, /<details class="calling-points">/);
  assert.match(styles, /\.calling-points summary/);
  assert.match(styles, /\.favourite-arrival-list/);
  assert.match(serviceWorker, /live-tfl-arrivals-static-v25/);
});
