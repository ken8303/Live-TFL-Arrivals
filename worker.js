import { onRequestGet as getNationalRailArrivals } from "./functions/api/national-rail/arrivals.js";
import { onRequestGet as getNationalRailConfig } from "./functions/api/national-rail/config.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/national-rail/arrivals") {
      return getNationalRailArrivals({ request, env });
    }

    if (url.pathname === "/api/national-rail/config") {
      return getNationalRailConfig({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};
