import "server-only";
import { createGeminiClient } from "./client";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./models";

/** Most texts the Gemini API embeds in one request (batchEmbedContents). */
export const EMBED_BATCH_SIZE = 100;

/** Documents are stored; queries are matched against them. */
export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/**
 * Embeds texts with gemini-embedding-001 at 1536 dims, in order, as unit
 * vectors. Sends at most EMBED_BATCH_SIZE texts per request. Throws if the
 * API returns the wrong number of vectors or a vector of the wrong length.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = createGeminiClient();
  const vectors: number[][] = [];
  for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
      config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
    });
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
export function embedDocuments(texts: string[]): Promise<number[][]> {
  return embedTexts(texts, "RETRIEVAL_DOCUMENT");
}

/** Embeds a visitor's question (RETRIEVAL_QUERY). */
export async function embedQuery(question: string): Promise<number[]> {
  const [vector] = await embedTexts([question], "RETRIEVAL_QUERY");
  return vector;
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
