// Starts PostHog in the browser (project.md §6.11). Only on the landing page
// and the dashboard: never on /embed, which runs inside customers' sites and
// whose visitors must not be tracked. posthog-js is imported on demand, so a
// page that never starts PostHog loads none of its code.
import type { PostHog } from "posthog-js";
import type { PostHogConfigResponse } from "@askwell/shared";
// Types only: events.ts is server-only, and type imports are erased.
import type { AnalyticsEvents, ClientAnalyticsEvent } from "./events";
import { isTrackedPath } from "./paths";

export const POSTHOG_CONFIG_PATH = "/api/posthog-config";

export type AnalyticsDeps = {
  fetchConfig: () => Promise<PostHogConfigResponse>;
  loadPostHog: () => Promise<PostHog>;
  /** The URL's path right now (window.location); the target path where there's no window. */
  currentPath?: () => string;
  sleep?: (ms: number) => Promise<void>;
};

/** How long a client-side navigation may take to reach its URL before PostHog starts anyway. */
export const NAVIGATION_WAIT_MS = 3000;
const NAVIGATION_POLL_MS = 50;

const defaultDeps: AnalyticsDeps = {
  fetchConfig: async () => {
    const res = await fetch(POSTHOG_CONFIG_PATH, { cache: "no-store" });
    if (!res.ok) throw new Error(`${POSTHOG_CONFIG_PATH}: HTTP ${res.status}`);
    return (await res.json()) as PostHogConfigResponse;
  },
  loadPostHog: async () => (await import("posthog-js")).default,
};

const browserPath = () =>
  typeof window === "undefined" ? null : window.location.pathname;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Waits until the URL shows `pathname`, and returns the path it ended on.
 * onRouterTransitionStart fires before the URL changes, and init's first
 * $pageview reads the URL: without this, a move from /sign-in to /dashboard
 * was recorded as a /sign-in pageview.
 */
async function untilPath(
  pathname: string,
  deps: AnalyticsDeps,
): Promise<string> {
  const current = deps.currentPath ?? (() => browserPath() ?? pathname);
  const sleep = deps.sleep ?? wait;
  for (
    let waited = 0;
    waited < NAVIGATION_WAIT_MS;
    waited += NAVIGATION_POLL_MS
  ) {
    if (current() === pathname) return pathname;
    await sleep(NAVIGATION_POLL_MS);
  }
  return current();
}

let started: Promise<PostHog | null> | null = null;
let instance: PostHog | null = null;
/** The signed-in Clerk user, as AnalyticsIdentity last saw it. undefined = not known yet. */
let userId: string | null | undefined;

/** The init options. Inputs are masked in replays; `ph-no-capture` is honored by default. */
export function posthogOptions(host: string) {
  return {
    api_host: host,
    defaults: "2026-08-30",
    // Only people who sign in get a profile; landing visitors stay anonymous.
    person_profiles: "identified_only",
    capture_pageview: "history_change",
    capture_exceptions: true,
    session_recording: { maskAllInputs: true },
  } as const;
}

/**
 * Starts PostHog once, if `pathname` is tracked and the server has a key.
 * Never throws: without a key (local runs, tests) or on any error it resolves
 * to null and the app runs without analytics.
 */
export function startAnalytics(
  pathname: string,
  deps: AnalyticsDeps = defaultDeps,
): Promise<PostHog | null> {
  if (started) return started;
  if (!isTrackedPath(pathname)) return Promise.resolve(null);
  started = (async () => {
    try {
      const config = await deps.fetchConfig();
      if (!config.key || !config.host) return null;
      const posthog = await deps.loadPostHog();
      // The move went somewhere untracked: don't start (a later move may).
      if (!isTrackedPath(await untilPath(pathname, deps))) {
        started = null;
        return null;
      }
      posthog.init(config.key, posthogOptions(config.host));
      instance = posthog;
      applyUser(posthog, userId);
      return posthog;
    } catch (error) {
      console.warn("PostHog did not start", error);
      return null;
    }
  })();
  return started;
}

/** Called by AnalyticsIdentity whenever Clerk's user changes. Applied once PostHog starts. */
export function setAnalyticsUser(next: string | null): void {
  const previous = userId;
  userId = next;
  if (!instance) return;
  if (next === null && typeof previous === "string") {
    instance.reset();
    return;
  }
  applyUser(instance, next);
}

function applyUser(posthog: PostHog, id: string | null | undefined): void {
  if (typeof id !== "string" || posthog.get_distinct_id() === id) return;
  // A different person signed in on this browser: start them a fresh identity
  // instead of merging the two.
  if (posthog._isIdentified()) posthog.reset();
  posthog.identify(id);
}

/**
 * Sends a browser product event (lib/analytics/events.ts). A no-op until
 * PostHog has started, so it does nothing without a key or on /embed. Never throws.
 */
export function trackClient<E extends ClientAnalyticsEvent>(
  event: E,
  properties: AnalyticsEvents[E],
): void {
  try {
    instance?.capture(event, properties);
  } catch (error) {
    console.warn("PostHog capture failed", error);
  }
}

/** Test only: forget the started instance and user. */
export function resetAnalyticsForTests(): void {
  started = null;
  instance = null;
  userId = undefined;
}
