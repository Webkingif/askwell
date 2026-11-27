import "server-only";
import { ThinkingLevel } from "@google/genai";
import { createGeminiClient } from "./client";
import { CHAT_MODEL } from "./models";
import {
  buildUserPrompt,
  I_DONT_KNOW,
  SYSTEM_PROMPT,
  type PromptChunk,
} from "./prompt";

/**
 * The lowest level Flash-Lite accepts (also its default; it can't be turned
 * off). A short answer from 5 chunks needs little reasoning, and thinking
 * tokens count as output. Sent explicitly so a new default can't raise it.
 */
export const CHAT_THINKING_LEVEL = ThinkingLevel.MINIMAL;

export type Answer = {
  reply: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
};

/**
 * Answers a visitor's question from the retrieved chunks only.
 * With no chunks it replies "I don't know" without calling the model.
 */
export async function answerFromChunks(
  question: string,
  chunks: PromptChunk[],
): Promise<Answer> {
  const started = performance.now();
  if (chunks.length === 0) {
    return {
      reply: I_DONT_KNOW,
      model: CHAT_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
  }
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: buildUserPrompt(question, chunks),
    // No temperature: the model's default is fine, and the system prompt
    // keeps answers to the chunks.
    config: {
      systemInstruction: SYSTEM_PROMPT,
      thinkingConfig: { thinkingLevel: CHAT_THINKING_LEVEL },
    },
  });
  const usage = response.usageMetadata;
  return {
    reply: cleanReply(response.text),
    model: response.modelVersion ?? CHAT_MODEL,
    inputTokens: usage?.promptTokenCount ?? 0,
    // Thinking tokens are billed as output.
    outputTokens:
      (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    latencyMs: Math.round(performance.now() - started),
  };
}

/** Empty or "I don't know."-style replies become the exact constant. */
function cleanReply(text: string | undefined): string {
  const reply = text?.trim() ?? "";
  if (reply === "" || /^i\s+don['’]?t\s+know[.!]?$/i.test(reply)) {
    return I_DONT_KNOW;
  }
  return reply;
}
