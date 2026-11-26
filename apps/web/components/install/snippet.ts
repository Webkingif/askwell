// The install tag (project.md §6.5, §6.9) and the origin it points at.
// No server-only import: the pure functions are shared with tests; only the
// page calls appOrigin, with the server's env and request headers.

/** `<script src="{origin}/widget.js" data-key="{key}" async></script>` */
export function buildSnippet(origin: string, publicKey: string): string {
  return `<script src="${origin}/widget.js" data-key="${publicKey}" async></script>`;
}

export interface OriginEnv {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_URL?: string;
}

/** The request's own host, for local dev when neither variable is set. */
export interface RequestHost {
  host: string | null;
  proto: string | null;
}

/** Origin of a URL, or null if it isn't a valid http(s) URL. */
function originOf(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * Where widget.js is served from:
 * 1. NEXT_PUBLIC_APP_URL, when set (production's own domain);
 * 2. else this deployment on Vercel: https://VERCEL_URL (on a preview, the
 *    per-deployment URL; widget.js takes its API origin from its own src,
 *    so it works there);
 * 3. else the request's host (local dev).
 */
export function appOrigin(env: OriginEnv, request: RequestHost): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    const origin = originOf(configured);
    if (origin) return origin;
  }

  const vercel = env.VERCEL_URL?.trim();
  if (vercel) {
    const origin = originOf(`https://${vercel}`);
    if (origin) return origin;
  }

  const host = request.host?.split(",")[0]?.trim();
  if (host) {
    const proto =
      request.proto?.split(",")[0]?.trim() === "https" ? "https" : "http";
    const origin = originOf(`${proto}://${host}`);
    if (origin) return origin;
  }

  return "http://localhost:3000";
}
