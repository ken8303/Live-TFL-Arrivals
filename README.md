# Live TfL Arrivals

Static frontend with a small local server for protected National Rail requests.

## Run Locally

1. Copy `.env.example` to `.env`.
2. Add `READING_OPEN_DATA_API_TOKEN` for Reading Buses, `TFL_APP_KEY` for TfL, and `NATIONAL_RAIL_DARWIN_TOKEN` for National Rail to `.env`, as needed.
3. Start the server:

```sh
node server.cjs
```

4. Open:

```text
http://127.0.0.1:8000/
```

Do not open `public/index.html` directly when using National Rail data. A `file://` page cannot securely call the protected API.

## Security

Never add National Rail credentials to `public/app.js`, `public/index.html`, or any other browser file. Browser files can be viewed by anyone using the site.

The server reads credentials from `.env`, calls National Rail from the backend, and only sends safe arrival data back to the browser.

## Cloudflare

Cloudflare does not run `server.cjs`. That file is only for local development.

The full app, including scheduled push, uses Cloudflare Workers:

- Cloudflare Workers with `npx wrangler deploy`, using `worker.js`, `wrangler.jsonc`, and `public/`.

The legacy Cloudflare Pages Functions remain for arrival feeds, but Pages does not
run the Worker's scheduled push handler. If an existing Pages deployment must be
kept, set its build output directory to `public`, never `/`; otherwise repository
source and local files could be published as static assets.

If your Cloudflare project uses a deploy command, use:

```text
npx wrangler deploy
```

For an existing Pages project, use these settings:

```text
Framework preset: None / Static
Build command: leave empty
Build output directory: public
Deploy command: leave empty
```

In Cloudflare, open your project and add the same secret values under:

```text
Settings > Variables and Secrets
```

For live arrivals, add:

```text
NATIONAL_RAIL_DARWIN_TOKEN
READING_OPEN_DATA_API_TOKEN
TFL_APP_KEY
```

`TFL_APP_KEY` is used only by the backend through `/api/tfl/...`, so the browser never sees your TfL API key. If your TfL account also gives an app id, add it as `TFL_APP_ID`.

With Wrangler, add the TfL key as a secret:

```sh
npx wrangler secret put TFL_APP_KEY
```

Do not put the TfL key in `public/app.js`, `public/index.html`, `wrangler.jsonc`, or `.env` committed to GitHub.

This must be the OpenLDBWS / Darwin live departure board token, usually shaped like:

```text
nnnnnnnn-nnnn-nnnn-nnnn-nnnnnnnnnnnn
```

National Rail Data Portal username/password credentials are not enough for the live arrivals board. They are for Data Portal feeds, not the OpenLDBWS SOAP live board endpoint.

Keep these only if you later add Data Portal feed features:

```text
NATIONAL_RAIL_USERNAME
NATIONAL_RAIL_PASSWORD
```

## Server Push Notifications

The Scheduler page can send background Web Push notifications from Cloudflare Workers. Browser-only notifications still work while the app is open, but server push needs Cloudflare storage and VAPID keys.

Create a KV namespace in Cloudflare and bind it to the Worker as:

```text
PUSH_SCHEDULES
```

The production namespace is also recorded in `wrangler.jsonc` so GitHub and Cloudflare deploys keep the same binding.

Also add these Worker secrets:

```text
VAPID_PUBLIC_KEY
VAPID_PRIVATE_JWK
VAPID_SUBJECT
```

`VAPID_PUBLIC_KEY` is the public application server key used by the browser Push API. `VAPID_PRIVATE_JWK` must be the matching private P-256 JSON Web Key and must stay in Cloudflare secrets only. `VAPID_SUBJECT` should be a contact value such as `mailto:you@example.com`.

You can generate matching values with:

```sh
node scripts/generate-vapid-keys.mjs
```

The Worker runs the scheduler every 5 minutes using the cron trigger in `wrangler.jsonc`.

`wrangler.jsonc` also configures rate limits for push writes and public API reads.
The rate-limit bindings require Wrangler 4.36 or newer. Limits are per Cloudflare
location, so they reduce routine abuse but are not a global quota guarantee.
For a legacy Pages deployment, configure equivalent WAF rate limiting for
`/api/*`; the Worker bindings do not apply to Pages Functions.


### Reminder storage compatibility

Each reminder now has an independent `schedule-index:` record. Older time-based
`schedule:` records remain supported; editing or deleting a reminder also handles
records omitted by the former shared endpoint index. Deletion markers suppress
obsolete records after KV changes propagate. Delivery state is stored under
`fired:` keys so the cron cannot overwrite an edited reminder.
KV is eventually consistent, so an update or deletion may not be visible to a
scheduler running elsewhere immediately. The existing KV-based quota is also a
best-effort limit, not an atomic reservation across concurrent requests.
