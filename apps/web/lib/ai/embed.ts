import "server-only";
import { createGeminiClient } from "./client";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";

/** Most texts the Gemini API embeds in one request (batchEmbedContents). */
export const EMBED_BATCH_SIZE = 100;

/**
 * Most estimated tokens per request. gemini-embedding-001's free tier allows
 * 30,000 tokens a minute per Google project, shared by every customer
 * (project.md §3). 20,000 leaves room for chat's question embeddings.
 */
export const EMBED_BATCH_TOKENS = 20_000;

/** Same estimate as lib/knowledge/chunk.ts (CHARS_PER_TOKEN). */
export const EMBED_CHARS_PER_TOKEN = 4;

/** Wait after a 429 that names no retryDelay: the quota window is a minute. */
export const RATE_LIMIT_FALLBACK_MS = 60_000;

/**
 * Document embedding gives up after this long. Processing runs in after()
 * inside the routes' maxDuration of 300 s, so this leaves time to save.
 */
export const DOCUMENT_EMBED_DEADLINE_MS = 270_000;

/** A visitor is waiting: chat's question gets one short retry at most. */
export const QUERY_EMBED_DEADLINE_MS = 5_000;

/** Documents are stored; queries are matched against them. */
export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export type EmbedOptions = {
  /** Give up on rate limits after this many ms from the start. */
  deadlineMs?: number;
};

/** Thrown when Gemini keeps rate limiting until the deadline. */
export class EmbedRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbedRateLimitError";
  }
}

/**
 * Embeds texts with gemini-embedding-001 at 1536 dims, in order, as unit
 * vectors. Each request holds at most EMBED_BATCH_SIZE texts and about
 * EMBED_BATCH_TOKENS estimated tokens. On a 429 it waits Google's
 * retryDelay (or a minute) and retries the batch, until `deadlineMs`; then
 * it throws EmbedRateLimitError. Throws if the API returns the wrong number
 * of vectors or a vector of the wrong length.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
  { deadlineMs = DOCUMENT_EMBED_DEADLINE_MS }: EmbedOptions = {},
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = createGeminiClient();
  const giveUpAt = Date.now() + deadlineMs;
  const vectors: number[][] = [];
  for (const batch of batchTexts(texts)) {
    const response = await withRateLimitRetry(
      () =>
        ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: batch,
          config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
        }),
      giveUpAt,
      deadlineMs,
    );
    const embeddings = response.embeddings ?? [];
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Gemini embeddings: expected ${batch.length} vectors, got ${embeddings.length}`,
      );
    }
    for (const embedding of embeddings) {
      vectors.push(checkVector(embedding.values));
    }
  }
  return vectors;
}

/** Embeds the documents to store (RETRIEVAL_DOCUMENT). */
export function embedDocuments(
  texts: string[],
  options?: EmbedOptions,
): Promise<number[][]> {
  return embedTexts(texts, "RETRIEVAL_DOCUMENT", options);
}

/**
 * Embeds a visitor's question (RETRIEVAL_QUERY). Retries a 429 only if
 * Google's retryDelay fits in QUERY_EMBED_DEADLINE_MS.
 */
export async function embedQuery(question: string): Promise<number[]> {
  const [vector] = await embedTexts([question], "RETRIEVAL_QUERY", {
    deadlineMs: QUERY_EMBED_DEADLINE_MS,
  });
  return vector;
}

/** Estimated tokens in a text (chars / 4, rounded up). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / EMBED_CHARS_PER_TOKEN);
}

/**
 * Splits texts, in order, into batches of at most EMBED_BATCH_SIZE texts
 * and EMBED_BATCH_TOKENS estimated tokens. A single text over the token
 * limit goes alone (chunks are about 800 tokens, so that doesn't happen).
 */
export function batchTexts(texts: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const t = estimateTokens(text);
    if (
      batch.length > 0 &&
      (batch.length === EMBED_BATCH_SIZE || tokens + t > EMBED_BATCH_TOKENS)
    ) {
      batches.push(batch);
      batch = [];
      tokens = 0;
    }
    batch.push(text);
    tokens += t;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function withRateLimitRetry<T>(
  send: () => Promise<T>,
  giveUpAt: number,
  deadlineMs: number,
): Promise<T> {
  for (;;) {
    try {
      return await send();
    } catch (err) {
      if (!isRateLimited(err)) throw err;
      const waitMs = retryDelayMs(err) ?? RATE_LIMIT_FALLBACK_MS;
      if (Date.now() + waitMs > giveUpAt) {
        throw new EmbedRateLimitError(
          `Gemini embeddings: rate limited (429); the next retry, in ${Math.ceil(waitMs / 1000)} s, would pass the ${Math.round(deadlineMs / 1000)} s deadline`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

/** The SDK's ApiError carries the HTTP status; the body is its message. */
function isRateLimited(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as { status?: unknown }).status;
  return status === 429 || /RESOURCE_EXHAUSTED/.test(err.message);
}

/**
 * Google's RetryInfo.retryDelay (e.g. "37s" or "1.5s") from the error body
 * in the message, in ms; null when there's none.
 */
export function retryDelayMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;
  const match = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(err.message);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

function checkVector(values: number[] | undefined): number[] {
  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Gemini embeddings: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${values?.length ?? 0}`,
    );
  }
  if (!values.every(Number.isFinite)) {
    throw new Error("Gemini embeddings: vector holds a non-finite value");
  }
  // gemini-embedding-001 only normalizes 3072-dim output; Google says to
  // normalize smaller ones yourself.
  const norm = Math.hypot(...values);
  if (norm === 0) throw new Error("Gemini embeddings: zero vector");
  return values.map((v) => v / norm);
}
