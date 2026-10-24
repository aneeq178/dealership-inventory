import type { NextConfig } from "next";

/**
 * The frontend is a fully static, client-rendered app (`next build` -> `out/`).
 *
 * Why static export:
 * - All data is user-specific and fetched in the browser with the user's bearer token,
 *   so server rendering adds nothing.
 * - The output is plain files that the Cloudflare Worker serves next to the API on the same
 *   origin (no CORS, no Node server). Locally, FastAPI can serve the same folder for E2E tests.
 *
 * Consequences: no rewrites/redirects/middleware, no dynamic route segments. The edit page
 * therefore uses a query string (/vehicles/edit/?id=...) instead of /vehicles/[id].
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true, // emit /vehicles/index.html etc., which every static host resolves
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
