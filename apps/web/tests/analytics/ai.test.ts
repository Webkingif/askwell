import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captured = vi.hoisted(() => [] as unknown[]);
vi.mock("../../lib/analytics/server", () => ({
  captureServerEvent: (e: unknown) => captured.push(e),
}));

const { aiGenerationProperties, trackAiGeneration } =
  await import("../../lib/analytics/ai");
const { CHAT_MODEL_PRICE_USD_PER_TOKEN } = await import("../../lib/ai/models");

const generation = {
  model: "gemini-3.5-flash-lite",
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  latencyMs: 1500,
  projectId: "p1",
  traceId: "c1",
  chunks: 5,
};

describe("aiGenerationProperties", () => {
  it("prices tokens at the list price: $0.30 in, $2.50 out per 1M", () => {
    expect(CHAT_MODEL_PRICE_USD_PER_TOKEN.input * 1e6).toBeCloseTo(0.3);
    expect(CHAT_MODEL_PRICE_USD_PER_TOKEN.output * 1e6).toBeCloseTo(2.5);
    const p = aiGenerationProperties(generation);
    expect(p.$ai_input_cost_usd).toBeCloseTo(0.3);
    expect(p.$ai_output_cost_usd).toBeCloseTo(2.5);
    expect(p.$ai_total_cost_usd).toBeCloseTo(2.8);
  });

  it("latency in seconds, Google as provider, the conversation as trace", () => {
    expect(aiGenerationProperties(generation)).toMatchObject({
      $ai_model: "gemini-3.5-flash-lite",
      $ai_provider: "google",
      $ai_latency: 1.5,
      $ai_trace_id: "c1",
      $ai_is_error: false,
      projectId: "p1",
    });
  });

  it("privacy mode: no input or output text properties at all", () => {
    const keys = Object.keys(aiGenerationProperties(generation));
    expect(keys).not.toContain("$ai_input");
    expect(keys).not.toContain("$ai_output_choices");
    expect(keys).not.toContain("$ai_error");
  });

  it("an error trace carries $ai_is_error and the short label", () => {
    expect(
      aiGenerationProperties({
        ...generation,
        inputTokens: 0,
        outputTokens: 0,
        error: "ApiError 503",
      }),
    ).toMatchObject({
      $ai_is_error: true,
      $ai_error: "ApiError 503",
      $ai_total_cost_usd: 0,
    });
  });

  it("trackAiGeneration sends $ai_generation under the owner", () => {
    trackAiGeneration("user_owner", generation);
    expect(captured).toEqual([
      expect.objectContaining({
        event: "$ai_generation",
        distinctId: "user_owner",
      }),
    ]);
  });
});
