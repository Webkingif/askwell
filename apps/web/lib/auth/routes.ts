// Which requests need a signed-in owner (project.md §6.2, §8).
// Pure: no Clerk, no Next imports, so it can be unit tested.
import { API_ERROR_STATUS, apiError, type ApiError } from "@askwell/shared";

export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const DASHBOARD_PATH = "/dashboard";

/** API routes anyone may call: the widget, Clerk's webhook, PostHog's public config. */
const PUBLIC_API_PREFIXES = ["/api/widget/"] as const;
const PUBLIC_API_PATHS = ["/api/clerk/webhook", "/api/posthog-config"] as const;

export type RouteAccess = "public" | "owner-page" | "owner-api";

/** True when `pathname` is `base` or a path below it (`/dashboard`, `/dashboard/x`, not `/dashboardx`). */
function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function routeAccess(pathname: string): RouteAccess {
  if (isUnder(pathname, DASHBOARD_PATH)) return "owner-page";
  if (isUnder(pathname, "/api")) {
    const isPublic =
      PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)) ||
      (PUBLIC_API_PATHS as readonly string[]).includes(pathname);
    return isPublic ? "public" : "owner-api";
  }
  return "public";
}

export type AuthDecision = "allow" | "redirect-to-sign-in" | "unauthorized";

/** What the proxy does with a request: let it through, send a page visitor to sign in, or 401 an API call. */
export function authDecision(
  pathname: string,
  signedIn: boolean,
): AuthDecision {
  const access = routeAccess(pathname);
  if (access === "public" || signedIn) return "allow";
  return access === "owner-api" ? "unauthorized" : "redirect-to-sign-in";
}

export const UNAUTHORIZED_STATUS = API_ERROR_STATUS.unauthorized;

export function unauthorizedBody(): ApiError {
  return apiError("unauthorized", "Sign in to continue.");
}
