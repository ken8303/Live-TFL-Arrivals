const READING_API_BASE = "https://reading-opendata.r2p.com/api/v1";

export function buildReadingApiUrl(path, env, requestUrl) {
  if (!env.READING_OPEN_DATA_API_TOKEN) {
    throw new Error("Add READING_OPEN_DATA_API_TOKEN to use Reading Buses data.");
  }

  const url = new URL(`${READING_API_BASE}${path}`);
  url.searchParams.set("api_token", env.READING_OPEN_DATA_API_TOKEN);

  if (requestUrl) {
    const source = new URL(requestUrl);
    source.searchParams.forEach((value, key) => {
      if (key === "api_token") return;
      url.searchParams.set(key, value);
    });
  }

  return url;
}

export async function fetchReadingJson(path, env, requestUrl) {
  const url = buildReadingApiUrl(path, env, requestUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reading Buses request failed with status ${response.status}.`);
  }
  return response.json();
}

export async function fetchReadingText(path, env, requestUrl) {
  const url = buildReadingApiUrl(path, env, requestUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Reading Buses request failed with status ${response.status}.`);
  }
  return response.text();
}
