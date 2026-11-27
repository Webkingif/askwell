import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { readGeminiEnv } = await import("../../lib/ai/env");

describe("readGeminiEnv", () => {
  it("returns the key", () => {
    expect(readGeminiEnv({ GEMINI_API_KEY: "test-key" })).toEqual({
      GEMINI_API_KEY: "test-key",
    });
  });

  it.each([undefined, "", "   "])("errors clearly when the key is %j", (v) => {
    expect(() => readGeminiEnv({ GEMINI_API_KEY: v })).toThrow(
      /GEMINI_API_KEY is not set/,
    );
  });
});
