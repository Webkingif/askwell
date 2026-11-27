import "server-only";
import arcjet, {
  createRemoteClient,
  detectPromptInjection,
  fixedWindow,
} from "@arcjet/next";
import { readArcjetKey } from "./env";

// Arcjet for the public widget routes (project.md §3 Security, §6.6 step 1,
// §9 Cost abuse / Prompt injection). Fails open: an Arcjet error, a timeout
// or a missing key lets the request through, with a console.warn. The
// monthly message quota stays in Postgres.

export type WidgetRoute = "chat" | "config";

/** Requests per minute per route + public key + IP. */
export const WIDGET_RATE_LIMITS = { chat: 20, config: 60 } as const;
export const WIDGET_RATE_WINDOW = "1m";

/** Decide API timeout; the SDK default is 2 s. */
export const ARCJET_TIMEOUT_MS = 500;
/** Hard cap on the whole protect() call, local analysis included. */
export const PROTECT_DEADLINE_MS = 1_000;

/** Rate-limit key: the route, the widget's public key, and the client IP. */
export const RATE_LIMIT_CHARACTERISTICS = [
  "route",
  "publicKey",
  "ip.src",
] as const;

export type ProtectResult =
  { allowed: true } | { allowed: false; reason: "rate_limit" | "injection" };

function buildClients(key: string) {
  const base = arcjet({
    key,
    characteristics: RATE_LIMIT_CHARACTERISTICS,
    client: createRemoteClient({ timeout: ARCJET_TIMEOUT_MS }),
    rules: [],
  });
  const limit = (max: number) =>
    fixedWindow({ mode: "LIVE", window: WIDGET_RATE_WINDOW, max });
  const chat = base.withRule(limit(WIDGET_RATE_LIMITS.chat));
  return {
    config: base.withRule(limit(WIDGET_RATE_LIMITS.config)),
    chat,
    // withRule clones share the decision cache (one client, per Arcjet).
    chatMessage: chat.withRule(detectPromptInjection({ mode: "LIVE" })),
  };
}

let clients: { key: string; value: ReturnType<typeof buildClients> } | null =
  null;

function getClients(key: string) {
  if (clients?.key !== key) clients = { key, value: buildClients(key) };
  return clients.value;
}

/**
 * Rate limits a widget request, and checks `message` for prompt injection
 * when one is given. Call once per request, inside the route handler.
 */
export async function protectWidgetRequest(
  request: Request,
  options: { route: WidgetRoute; publicKey: string; message?: string },
): Promise<ProtectResult> {
  const { route, publicKey, message } = options;
  const key = readArcjetKey();
  if (!key) {
    console.warn("Arcjet: ARCJET_KEY is not set; allowing the request");
    return { allowed: true };
  }

  try {
    const c = getClients(key);
    const props = { route, publicKey };
    const pending =
      route === "chat" && message !== undefined
        ? c.chatMessage.protect(request, {
            ...props,
            detectPromptInjectionMessage: message,
          })
        : c[route].protect(request, props);
    const decision = await withDeadline(pending, PROTECT_DEADLINE_MS);

    if (decision.isErrored()) {
      console.warn("Arcjet: decision errored; allowing the request", {
        route,
        error: decision.reason.isError() ? decision.reason.message : undefined,
      });
      return { allowed: true };
    }
    if (!decision.isDenied()) return { allowed: true };
    // TODO(Phase 4): when route === "chat", send the `message_blocked`
    // PostHog event (project.md §6.6 step 1) with the reason below, once
    // NEXT_PUBLIC_POSTHOG_KEY is available.
    if (decision.reason.isPromptInjection()) {
      return { allowed: false, reason: "injection" };
    }
    if (decision.reason.isError()) {
      // A rule that failed to run is our failure, not the visitor's.
      console.warn("Arcjet: rule errored; allowing the request", {
        route,
        error: decision.reason.message,
      });
      return { allowed: true };
    }
    // Rate limit, or a rule added in the Arcjet console: slow down.
    return { allowed: false, reason: "rate_limit" };
  } catch (err) {
    console.warn("Arcjet: protect failed; allowing the request", {
      route,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true };
  }
}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
