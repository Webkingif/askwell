import "server-only";

// Server-side only: callers never pick a model (project.md §3).

/**
 * Embedding model for knowledge chunks and questions. Takes at most 2,048
 * input tokens per text. Below 3072 dims its vectors are not normalized,
 * so embed.ts normalizes them.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/** Matches knowledge_chunks.embedding vector(1536). */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Chat model: the newest stable Gemini Flash-Lite, chosen for its free-tier
 * daily limit (product owner, 2026-11-27). gemini-4-hydrogen's free tier
 * allowed 20 answers a day per Google project, shared by every customer
 * project. Free tier for this model, per Google project and shared by
 * every customer project: 500 requests a day, 15 a minute and 250,000
 * tokens a minute (AI Studio, 2026-11-27; docs/project.md §3).
 */
export const CHAT_MODEL = "gemini-3.5-flash-lite";

/**
 * CHAT_MODEL's list prices in USD per token, for the PostHog AI trace's cost
 * (project.md §6.11). Paid tier, Standard: $0.30 per 1M input tokens (text,
 * image, video, audio) and $2.50 per 1M output tokens, thinking included.
 * Source: https://ai.google.dev/gemini-api/docs/pricing ("Gemini 3.5
 * Flash-Lite", read 2026-11-27). We run on the free tier, so this is what
 * the traffic would cost, not what it's billed. Update both together.
 */
export const CHAT_MODEL_PRICE_USD_PER_TOKEN = {
  input: 0.3 / 1_000_000,
  output: 2.5 / 1_000_000,
} as const;
