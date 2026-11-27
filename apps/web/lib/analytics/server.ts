import "server-only";
import { after } from "next/server";
import { PostHog } from "posthog-node";
import { readPostHogSettings, type PostHogSettings } from "./env";

// Server-side PostHog (project.md §6.11): events from route handlers and
// server error tracking. Without NEXT_PUBLIC_POSTHOG_KEY/HOST every function
// here is a no-op, and none of them ever throws, so analytics can't break a
// request, a local run or a test.

let cached: { settings: PostHogSettings; client: PostHog } | null = null;

/** One client per key and host, made on first use (not at import, so builds need no key). */
export function getPostHogServer(
  env: Record<string, string | undefined> = process.env,
): PostHog | null {
  const settings = readPostHogSettings(env);
  if (!settings) return null;
  if (
    cached &&
    cached.settings.key === settings.key &&
    cached.settings.host === settings.host
  ) {
    return cached.client;
  }
  cached = {
    settings,
    client: new PostHog(settings.key, { host: settings.host }),
  };
  return cached.client;
}

/** Sends the queue after the response, so the request doesn't wait for PostHog. */
function flushAfterResponse(client: PostHog): void {
  const flush = () =>
    client.flush().catch((error: unknown) => {
      console.warn("PostHog flush failed", error);
    });
  try {
    after(flush);
  } catch {
    // Outside a request (a script or a test): flush now, without waiting.
    void flush();
  }
}

export type ServerEvent = {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
};

/** Captures one event from a route handler. Call it inside the request. */
export function captureServerEvent({
  distinctId,
  event,
  properties,
}: ServerEvent): void {
  try {
    const client = getPostHogServer();
    if (!client) return;
    client.capture({ distinctId, event, properties });
    flushAfterResponse(client);
  } catch (error) {
    console.warn("PostHog capture failed", error);
  }
}

/**
 * The browser's PostHog distinct and session IDs, from its `ph_<key>_posthog`
 * cookie, so a server error links to the person and their replay.
 */
export function readPostHogCookie(
  cookieHeader: string | undefined,
  key: string,
): { distinctId?: string; sessionId?: string } {
  if (!cookieHeader) return {};
  const name = `ph_${key}_posthog=`;
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(name))
    ?.slice(name.length);
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(decodeURIComponent(raw));
    if (typeof value !== "object" || value === null) return {};
    const record = value as Record<string, unknown>;
    const distinctId =
      typeof record.distinct_id === "string" ? record.distinct_id : undefined;
    // $sesid is [last activity, session ID, session start].
    const sesid = record.$sesid;
    const sessionId =
      Array.isArray(sesid) && typeof sesid[1] === "string"
        ? sesid[1]
        : undefined;
    return { distinctId, sessionId };
  } catch {
    return {};
  }
}

export type RequestErrorInfo = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};

export type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
};

/** For instrumentation.ts onRequestError: sends the error and waits for it to go. */
export async function captureRequestError(
  error: unknown,
  request: RequestErrorInfo,
  context: RequestErrorContext,
): Promise<void> {
  try {
    const settings = readPostHogSettings();
    const client = getPostHogServer();
    if (!settings || !client) return;
    const cookie = request.headers.cookie;
    const { distinctId, sessionId } = readPostHogCookie(
      Array.isArray(cookie) ? cookie.join("; ") : cookie,
      settings.key,
    );
    await client.captureExceptionImmediate(error, {
      distinctId,
      properties: {
        $session_id: sessionId,
        // The path only: query strings can carry keys.
        path: request.path.split("?")[0],
        method: request.method,
        route_path: context.routePath,
        route_type: context.routeType,
        router_kind: context.routerKind,
      },
    });
  } catch (captureError) {
    console.warn("PostHog error capture failed", captureError);
  }
}

/** Test only: drop the cached client. */
export function resetPostHogServerForTests(): void {
  cached = null;
}
