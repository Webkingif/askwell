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
 * Chat model: Google's default fast model, successor to Gemini 3.8 Flash
 * (product owner's choice, 2026-11-27). Gemini 4 ignores `temperature`.
 */
export const CHAT_MODEL = "gemini-4-hydrogen";
