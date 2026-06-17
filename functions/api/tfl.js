const TFL_API_BASE = "https://api.tfl.gov.uk";
const API_PREFIX = "/api/tfl";
const MAX_QUERY_VALUE_LENGTH = 300;
const ALLOWED_QUERY_PARAMS = new Set([
  "lat",
  "lon",
  "stopTypes",
  "modes",
  "radius",
  "page",
  "lineIds",
  "direction",
]);

export async function onRequestGet({ request, env }) {
  try {
    const upstreamUrl = buildTflApiUrl(request, env);
    const response = await fetch(upstreamUrl, {
      headers: {
        Accept: "application/json",
      },
    });
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    return Response.json(
      {
        error: "TfL data could not be loaded.",
        help: error.message,
      },
      { status: 400 },
    );
  }
}

export function buildTflApiUrl(request, env = {}) {
  const requestUrl = new URL(request.url);
  const path = requestUrl.pathname.slice(API_PREFIX.length) || "/";
  if (!isAllowedTflPath(path)) {
    throw new Error("TfL endpoint is not allowed by this app.");
  }

  const upstreamUrl = new URL(`${TFL_API_BASE}${path}`);
  requestUrl.searchParams.forEach((value, key) => {
    if (!ALLOWED_QUERY_PARAMS.has(key)) return;
    upstreamUrl.searchParams.set(key, value.slice(0, MAX_QUERY_VALUE_LENGTH));
  });

  if (env.TFL_APP_KEY) upstreamUrl.searchParams.set("app_key", env.TFL_APP_KEY);
  if (env.TFL_APP_ID) upstreamUrl.searchParams.set("app_id", env.TFL_APP_ID);
  return upstreamUrl;
}

function isAllowedTflPath(path) {
  return [
    /^\/StopPoint$/,
    /^\/StopPoint\/Mode\/[a-z0-9,-]+$/i,
    /^\/StopPoint\/Search\/[^/]+$/i,
    /^\/StopPoint\/[^/]+\/Arrivals$/i,
    /^\/Place\/Search\/[^/]+$/i,
    /^\/Line\/[^/]+\/Status$/i,
  ].some((pattern) => pattern.test(path));
}
