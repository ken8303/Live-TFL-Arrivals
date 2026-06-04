export function onRequestGet(context) {
  const configured = Boolean(
    context.env.NATIONAL_RAIL_DARWIN_TOKEN ||
      context.env.NATIONAL_RAIL_TOKEN ||
      (context.env.NATIONAL_RAIL_USERNAME && context.env.NATIONAL_RAIL_PASSWORD),
  );

  return new Response(JSON.stringify({ configured }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
