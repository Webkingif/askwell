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
 * Chat model: the latest stable Gemini Flash-line model. Google calls
 * gemini-4-hydrogen "the recommended upgrade from Gemini 3.8 Flash", on the
 * free tier (aistudio.google.com/docs/whats-new-gemini-4-hydrogen). The
 * product owner chose it on 2026-11-27. Gemini 4 ignores `temperature`.
 */
export const CHAT_MODEL = "gemini-4-hydrogen";
