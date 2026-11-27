import "server-only";

// Server-side only: callers never pick a model (project.md §3).

/** Embedding model for knowledge chunks and questions. */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/** Matches knowledge_chunks.embedding vector(1536). */
export const EMBEDDING_DIMENSIONS = 1536;

/** Latest stable Gemini Flash model (the product owner's choice). */
export const CHAT_MODEL = "gemini-3.8-flash";
