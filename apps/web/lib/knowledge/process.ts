import "server-only";
import { KNOWLEDGE_FILE_TYPES, type KnowledgeFileType } from "@askwell/shared";
import { embedDocuments } from "../ai/embed";
import { createServiceClient, type ServiceClient } from "../supabase/service";
import { chunkText } from "./chunk";
import { ExtractError, extractText } from "./extract";

/** The private Storage bucket for uploaded files (created by a migration). */
export const KNOWLEDGE_BUCKET = "knowledge";

/** Chunk rows per insert request (each row carries a 1536-dim vector). */
export const CHUNK_INSERT_BATCH = 100;

export type ProcessFailure =
  | "not_found" // no such source
  | "not_processing" // the source isn't in `processing`; nothing was changed
  | "missing_text" // a pasted-text source called without its text
  | "missing_file" // a file source without a storage key, or the download failed
  | "empty" // the text or file holds no text
  | "unreadable" // the file can't be read (bad PDF, invalid UTF-8)
  | "embed_failed" // the embedding call failed
  | "store_failed"; // writing the chunks or the status failed

export type ProcessResult =
  | { status: "ready"; chunks: number }
  | { status: "failed"; reason: ProcessFailure };

export type ProcessInput = {
  /** The pasted text, for a `text` source (it isn't stored anywhere else). */
  text?: string;
};

type Source = {
  id: string;
  project_id: string;
  type: string;
  storage_key: string | null;
  status: string;
};

/** A failure that ends processing with this reason. */
class ProcessError extends Error {
  constructor(
    readonly reason: ProcessFailure,
    options?: { cause?: unknown },
  ) {
    super(reason, options);
  }
}

/**
 * Turns a `processing` source into searchable chunks: gets its text (the
 * pasted `input.text`, or the file from the `knowledge` bucket), extracts,
 * chunks, embeds, stores the chunks under the source's own project, and sets
 * the source `ready`. On any failure it removes the source's chunks and sets
 * it `failed`. It never throws.
 *
 * Uses the service client: call it only after the route has checked that the
 * owner owns the source's project (project.md §9).
 */
export async function processSource(
  sourceId: string,
  input: ProcessInput = {},
): Promise<ProcessResult> {
  let supabase: ServiceClient;
  let source: Source;
  try {
    supabase = createServiceClient();
    const { data, error } = await supabase
      .from("knowledge_sources")
      .select("id, project_id, type, storage_key, status")
      .eq("id", sourceId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { status: "failed", reason: "not_found" };
    source = data;
  } catch (error) {
    log(sourceId, "store_failed", error);
    return { status: "failed", reason: "store_failed" };
  }

  // Only a claimed source is processed: a paste inserts it as `processing`,
  // finalize moves an upload there. Anything else is left untouched.
  if (source.status !== "processing") {
    return { status: "failed", reason: "not_processing" };
  }

  try {
    const text = await sourceText(supabase, source, input);
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new ProcessError("empty");

    let vectors: number[][];
    try {
      vectors = await embedDocuments(chunks);
    } catch (cause) {
      throw new ProcessError("embed_failed", { cause });
    }

    await storeChunks(supabase, source, chunks, vectors);
    await setStatus(supabase, source, "ready");
    return { status: "ready", chunks: chunks.length };
  } catch (error) {
    const reason = error instanceof ProcessError ? error.reason : "store_failed";
    log(sourceId, reason, error);
    await markFailed(supabase, source);
    return { status: "failed", reason };
  }
}

async function sourceText(
  supabase: ServiceClient,
  source: Source,
  input: ProcessInput,
): Promise<string> {
  if (source.type === "text") {
    if (typeof input.text !== "string") throw new ProcessError("missing_text");
    return input.text;
  }
  if (!isFileType(source.type) || !source.storage_key) {
    throw new ProcessError("missing_file");
  }

  const { data, error } = await supabase.storage
    .from(KNOWLEDGE_BUCKET)
    .download(source.storage_key);
  if (error || !data) throw new ProcessError("missing_file", { cause: error });

  try {
    return await extractText(new Uint8Array(await data.arrayBuffer()), source.type);
  } catch (error) {
    if (error instanceof ExtractError) {
      throw new ProcessError(error.code, { cause: error });
    }
    throw new ProcessError("unreadable", { cause: error });
  }
}

/** Replaces the source's chunks. Every row carries the source's own project_id. */
async function storeChunks(
  supabase: ServiceClient,
  source: Source,
  chunks: string[],
  vectors: number[][],
): Promise<void> {
  if (vectors.length !== chunks.length) {
    throw new ProcessError("embed_failed");
  }
  // A retry starts clean.
  await deleteChunks(supabase, source);

  const rows = chunks.map((content, i) => ({
    project_id: source.project_id,
    source_id: source.id,
    content,
    embedding: toVectorLiteral(vectors[i]!),
  }));
  for (let start = 0; start < rows.length; start += CHUNK_INSERT_BATCH) {
    const { error } = await supabase
      .from("knowledge_chunks")
      .insert(rows.slice(start, start + CHUNK_INSERT_BATCH));
    if (error) throw new ProcessError("store_failed", { cause: error });
  }
}

async function deleteChunks(supabase: ServiceClient, source: Source): Promise<void> {
  const { error } = await supabase
    .from("knowledge_chunks")
    .delete()
    .eq("source_id", source.id)
    .eq("project_id", source.project_id);
  if (error) throw new ProcessError("store_failed", { cause: error });
}

async function setStatus(
  supabase: ServiceClient,
  source: Source,
  status: "ready" | "failed",
): Promise<void> {
  const { error } = await supabase
    .from("knowledge_sources")
    .update({ status })
    .eq("id", source.id)
    .eq("project_id", source.project_id);
  if (error) throw new ProcessError("store_failed", { cause: error });
}

/** Best effort: removes the chunks, then marks the source failed. Never throws. */
async function markFailed(supabase: ServiceClient, source: Source): Promise<void> {
  try {
    await deleteChunks(supabase, source);
  } catch (error) {
    log(source.id, "store_failed", error);
  }
  try {
    await setStatus(supabase, source, "failed");
  } catch (error) {
    log(source.id, "store_failed", error);
  }
}

function isFileType(type: string): type is KnowledgeFileType {
  return (KNOWLEDGE_FILE_TYPES as readonly string[]).includes(type);
}

/** pgvector's text form: `[0.1,0.2,…]`. */
function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** Logs the reason and the error's message only: never the source's text. */
function log(sourceId: string, reason: ProcessFailure, error: unknown): void {
  const cause = error instanceof ProcessError ? error.cause : error;
  // PostgREST and Storage errors are objects with a message, not always Errors.
  const text =
    typeof cause === "object" && cause !== null && "message" in cause
      ? String(cause.message)
      : cause === undefined
        ? ""
        : String(cause);
  const message = text === "" ? "" : `: ${text}`;
  console.error(`processSource ${sourceId}: ${reason}${message}`);
}
