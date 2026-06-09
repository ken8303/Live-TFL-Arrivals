import { fetchReadingJson } from "./shared.js";

export async function onRequestGet({ env, request }) {
  try {
    const data = await fetchReadingJson("/lines", env, request.url);
    return Response.json({
      source: "Reading Buses Open Data",
      lines: Array.isArray(data) ? data : data.data || data.lines || data.items || [],
    });
  } catch (error) {
    return Response.json(
      {
        error: "Reading bus lines could not be loaded.",
        help: error.message,
      },
      { status: 500 },
    );
  }
}
