import type { NextConfig } from "next";

/** Only the widget panel may be framed by other sites (project.md §9). */
export const EMBED_SOURCE = "/embed/:path*";
/** Every path except /embed and below it. */
export const NOT_EMBED_SOURCE = "/((?!embed(?:/|$)).*)";
export const WIDGET_SOURCE = "/widget.js";

/** Response headers by path (project.md §6.5, §9 Clickjacking, CORS). */
export async function securityHeaders() {
  return [
    {
      // The loader runs on customer sites; a short cache lets fixes roll out.
      source: WIDGET_SOURCE,
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        {
          key: "Content-Type",
          value: "application/javascript; charset=utf-8",
        },
        { key: "Cache-Control", value: "public, max-age=300" },
      ],
    },
    {
      // Any site may frame the panel. No X-Frame-Options: it can't say "any".
      source: EMBED_SOURCE,
      headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
    },
    {
      source: NOT_EMBED_SOURCE,
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        { key: "X-Frame-Options", value: "SAMEORIGIN" },
      ],
    },
  ];
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@askwell/shared", "@askwell/db"],
  headers: securityHeaders,
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
