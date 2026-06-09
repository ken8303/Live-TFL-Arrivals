import { getCachedBusStops, getCachedReadingBusStops } from "./shared.mjs";

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider") || "tfl";
    if (provider === "reading-buses") {
      return Response.json(await getCachedReadingBusStops(env));
    }
    return Response.json(await getCachedBusStops(env));
  } catch (error) {
    return Response.json(
      {
        error: "Bus stop catalog could not be loaded.",
        help: error.message,
      },
      { status: 500 },
    );
  }
}
