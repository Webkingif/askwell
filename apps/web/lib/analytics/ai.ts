import "server-only";
import { CHAT_MODEL_PRICE_USD_PER_TOKEN } from "../ai/models";
import { captureServerEvent } from "./server";

// PostHog LLM analytics (project.md §6.11 AI tracing): one `$ai_generation`
// event per chat-model call, grouped per conversation by `$ai_trace_id`.
// Privacy mode: no prompt, chunk or reply text, ever: tokens, cost, latency
// and IDs only.

/** One chat-model call, as the chat route saw it. */
export type AiGeneration = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  projectId: string;
  /** The conversation (grouping); a fresh ID when the call failed before one existed. */
  traceId: string;
  /** Chunks the answer was grounded in. */
  chunks: number;
  /** Set when the model call failed: a short name, never the error's text. */
  error?: string;
};

const roundUsd = (usd: number) => Math.round(usd * 1e9) / 1e9;

/** The `$ai_generation` properties: no text, cost from CHAT_MODEL's list price. */
export function aiGenerationProperties(g: AiGeneration) {
  const input = roundUsd(g.inputTokens * CHAT_MODEL_PRICE_USD_PER_TOKEN.input);
  const output = roundUsd(
    g.outputTokens * CHAT_MODEL_PRICE_USD_PER_TOKEN.output,
  );
  return {
    $ai_model: g.model,
    $ai_provider: "google",
    $ai_input_tokens: g.inputTokens,
    $ai_output_tokens: g.outputTokens,
    $ai_input_cost_usd: input,
    $ai_output_cost_usd: output,
    $ai_total_cost_usd: roundUsd(input + output),
    $ai_latency: g.latencyMs / 1000,
    $ai_trace_id: g.traceId,
    $ai_is_error: g.error !== undefined,
    ...(g.error !== undefined ? { $ai_error: g.error } : {}),
    projectId: g.projectId,
    chunks: g.chunks,
  };
}

/**
 * Sends the trace under the project owner's Clerk ID, so it sits in their
 * funnel. Visitors never become persons. A no-op without a key; never throws.
 */
export function trackAiGeneration(ownerId: string, g: AiGeneration): void {
  captureServerEvent({
    event: "$ai_generation",
    distinctId: ownerId,
    properties: aiGenerationProperties(g),
  });
}
