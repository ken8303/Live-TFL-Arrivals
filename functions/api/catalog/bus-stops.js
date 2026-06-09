import { getCachedBusStops } from "./shared.mjs";

export async function onRequestGet({ env }) {
  try {
    return Response.json(await getCachedBusStops(env));
  } catch (error) {
    return Response.json(
      {
        error: "TfL bus stop catalog could not be loaded.",
        help: error.message,
      },
      { status: 500 },
    );
  }
}
