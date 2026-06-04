# Live TfL Arrivals

Static frontend with a small local server for protected National Rail requests.

## Run Locally

1. Copy `.env.example` to `.env`.
2. Add your National Rail token or username/password to `.env`.
3. Start the server:

```sh
node server.js
```

4. Open:

```text
http://127.0.0.1:8000/
```

Do not open `index.html` directly when using National Rail data. A `file://` page cannot securely call the protected API.

## Security

Never add National Rail credentials to `app.js`, `index.html`, or any other browser file. Browser files can be viewed by anyone using the site.

The server reads credentials from `.env`, calls National Rail from the backend, and only sends safe arrival data back to the browser.

## Cloudflare

Cloudflare does not run `server.js`. That file is only for local development.

This project supports both deployment styles:

- Cloudflare Workers with `npx wrangler deploy`, using `worker.js`, `wrangler.jsonc`, and `public/`.
- Cloudflare Pages Functions, using `functions/api/national-rail/`.

If your Cloudflare project uses a deploy command, use:

```text
npx wrangler deploy
```

If your Cloudflare project is a Pages project, use these settings instead:

```text
Framework preset: None / Static
Build command: leave empty
Build output directory: /
Deploy command: leave empty
```

In Cloudflare, open your project and add the same secret values under:

```text
Settings > Variables and Secrets
```

For live arrivals, add:

```text
NATIONAL_RAIL_DARWIN_TOKEN
```

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

Then redeploy the Pages project from the latest GitHub commit.
