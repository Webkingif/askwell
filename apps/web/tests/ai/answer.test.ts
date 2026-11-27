import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => import("./sdk-mock"));

const sdk = await import("./sdk-mock");
const { answerFromChunks } = await import("../../lib/ai/answer");
const { CHAT_MODEL } = await import("../../lib/ai/models");
const { SYSTEM_PROMPT, I_DONT_KNOW } = await import("../../lib/ai/prompt");

const chunks = [{ content: "Support is open 9 to 5." }];

beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllEnvs();
  sdk.generateContent.mockReset();
});

describe("answerFromChunks", () => {
  it("sends the system prompt and delimited chunks, no temperature", async () => {
    sdk.generateContent.mockResolvedValue({
      text: "We're open 9 to 5.",
      modelVersion: "gemini-x-001",
      usageMetadata: {
        promptTokenCount: 120,
        candidatesTokenCount: 8,
        thoughtsTokenCount: 4,
      },
    });
    const answer = await answerFromChunks("When are you open?", chunks);
    expect(answer).toMatchObject({
      reply: "We're open 9 to 5.",
      model: "gemini-x-001",
      inputTokens: 120,
      outputTokens: 12,
    });
    expect(answer.latencyMs).toBeGreaterThanOrEqual(0);
    const [args] = sdk.generateContent.mock.calls[0];
    expect(args.model).toBe(CHAT_MODEL);
    expect(args.config.systemInstruction).toBe(SYSTEM_PROMPT);
    // Gemini 4 ignores sampling parameters; Google says to remove them.
    expect(args.config).not.toHaveProperty("temperature");
    // Hydrogen defaults to HIGH; a support answer needs LOW.
    expect(args.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(args.contents).toContain(
      '<chunk index="1">\nSupport is open 9 to 5.\n</chunk>',
    );
    expect(args.contents).toContain(
      "<question>\nWhen are you open?\n</question>",
    );
  });

  it(`replies "I don't know" without a call when there are no chunks`, async () => {
    const answer = await answerFromChunks("Anything?", []);
    expect(answer).toEqual({
      reply: I_DONT_KNOW,
      model: CHAT_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    });
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });

  it.each(["I don't know.", "  i dont know ", "I don’t know", "", undefined])(
    `normalises %j to the exact "I don't know"`,
    async (text) => {
      sdk.generateContent.mockResolvedValue({ text });
      const answer = await answerFromChunks("Q?", chunks);
      expect(answer.reply).toBe(I_DONT_KNOW);
      expect(answer.model).toBe(CHAT_MODEL);
      expect(answer.inputTokens).toBe(0);
    },
  );

  it("errors before any call when the key is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", undefined);
    await expect(answerFromChunks("Q?", chunks)).rejects.toThrow(
      /GEMINI_API_KEY is not set/,
    );
    expect(sdk.generateContent).not.toHaveBeenCalled();
  });
});
