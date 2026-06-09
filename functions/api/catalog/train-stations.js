import { getCachedTrainStations } from "./shared.mjs";

export async function onRequestGet({ env }) {
  try {
    return Response.json(await getCachedTrainStations(env));
  } catch (error) {
    return Response.json(
      {
        error: "TfL train station catalog could not be loaded.",
        help: error.message,
      },
      { status: 500 },
    );
  }
}
