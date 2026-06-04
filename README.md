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
