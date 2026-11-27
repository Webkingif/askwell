import "server-only";
import type { KnowledgeSourceType, Plan } from "@askwell/shared";
import { captureServerEvent } from "./server";

// The product events (project.md §6.11) and their properties, in one place.
// They feed the funnel: landing → sign up → project → knowledge → install →
// first chat → upgrade. Properties are IDs and enums only: never message
// text, titles, file names or keys (project.md §9).

export type AnalyticsEvents = {
  /** An `accounts` row was just inserted (ensureAccount). Once per owner. */
  signed_up: Record<string, never>;
  /** create_project succeeded. */
  project_created: { projectId: string; plan: Plan };
  /** Paste-text accepted, or an uploaded file finalized. */
  knowledge_added: { projectId: string; type: KnowledgeSourceType };
  /** The Install tab's Copy button (client side, lib/analytics/client.ts). */
  snippet_copied: { projectId: string };
  /** A project's first widget chat (B3, the chat route). */
  first_chat: { projectId: string };
  // TODO(Phase 5): the Clerk Billing webhook sends `upgraded`. Defined only.
  /** An owner moved to a paid plan. */
  upgraded: { plan: Plan };
  /** The chat route refused a message before the AI (B3). No message text. */
  message_blocked: { projectId: string; reason: "rate_limit" | "injection" };
};

export type AnalyticsEvent = keyof AnalyticsEvents;

/** Events the browser sends; the rest come from the server. */
export type ClientAnalyticsEvent = "snippet_copied";

/**
 * Sends one product event from the server, after the response. A no-op
 * without NEXT_PUBLIC_POSTHOG_KEY/HOST, and it never throws.
 * `distinctId` is the Clerk user ID, the same ID the browser identifies with.
 */
export function track<E extends AnalyticsEvent>(
  event: E,
  distinctId: string,
  properties: AnalyticsEvents[E],
): void {
  captureServerEvent({ event, distinctId, properties });
}
