import "server-only";
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  PLAN_LIMITS,
  knowledgeFileTypeFromName,
  type CreateTextKnowledgeRequest,
  type KnowledgeSource,
  type KnowledgeUploadUrlRequest,
  type KnowledgeUploadUrlResponse,
} from "@askwell/shared";
import type { Tables } from "@askwell/db";
import { ensureAccount } from "./accounts";
import { KNOWLEDGE_BUCKET } from "./knowledge/process";
import { ProjectApiError, getOwnedProject } from "./projects";
import { createOwnerClient } from "./supabase/owner";
import { createServiceClient, type ServiceClient } from "./supabase/service";

// The owner's knowledge routes (project.md §6.4, §8, §9).
//
// - Every function first checks that the signed-in owner owns the project (or,
//   for delete, can see the source) through the owner client, so RLS decides.
//   Only then does it write with the service client, by the project or source
//   id it was given: never by a hand-written owner filter.
// - The plan comes from ensureAccount() on the server, never from input.
// - Processing itself (processSource) runs in the route's after().

/**
 * An `uploading` reservation this old was never finalized.
 * reserve_knowledge_source reclaims it (the same 2 hours, in SQL), and the
 * signed upload URL has expired by then too.
 */
export const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;

/** The longest file name kept in a storage key (before the extension). */
export const MAX_STORAGE_NAME_LENGTH = 100;

const PDF_MAGIC = "%PDF-";

const COLUMNS = "id, project_id, title, type, status, storage_key, created_at";

type SourceRow = Pick<
  Tables<"knowledge_sources">,
  "id" | "project_id" | "title" | "type" | "status" | "storage_key" | "created_at"
>;

export function toKnowledgeSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    type: row.type as KnowledgeSource["type"],
    status: row.status as KnowledgeSource["status"],
    createdAt: row.created_at,
  };
}

/** A Supabase error, as an Error that never carries ids, keys or text in its message. */
function dbError(what: string, error: unknown): Error {
  const e = (typeof error === "object" && error !== null ? error : {}) as {
    code?: unknown;
    statusCode?: unknown;
  };
  const code = e.code ?? e.statusCode;
  return new Error(
    `knowledge: ${what} failed (${typeof code === "string" && code ? code : "no code"})`,
    { cause: error },
  );
}

const projectNotFound = () =>
  new ProjectApiError("not_found", "Project not found.");
const sourceNotFound = () =>
  new ProjectApiError("not_found", "Knowledge source not found.");

async function requireOwnedProject(projectId: string): Promise<void> {
  if (!(await getOwnedProject(projectId))) throw projectNotFound();
}

const staleCutoff = () => new Date(Date.now() - STALE_UPLOAD_MS).toISOString();

/**
 * Best effort: removes the Storage objects of the project's stale `uploading`
 * reservations, which reserve_knowledge_source is about to delete (SQL can't
 * remove Storage objects). Logs a failure and carries on. Call it only after
 * the ownership check.
 */
export async function removeStaleUploads(
  supabase: ServiceClient,
  projectId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("knowledge_sources")
      .select("storage_key")
      .eq("project_id", projectId)
      .eq("status", "uploading")
      .lt("created_at", staleCutoff())
      .not("storage_key", "is", null);
    if (error) throw dbError("stale select", error);
    const keys = data.flatMap((r) => (r.storage_key ? [r.storage_key] : []));
    if (keys.length === 0) return;
    const { error: removeError } = await supabase.storage
      .from(KNOWLEDGE_BUCKET)
      .remove(keys);
    if (removeError) throw dbError("stale remove", removeError);
  } catch (error) {
    console.error(
      `knowledge: stale upload cleanup for project ${projectId} failed`,
      error instanceof Error ? error.message : error,
    );
  }
}

type Reservation = {
  title: string;
  type: KnowledgeSource["type"];
  storageKey: string | null;
};

/** Ownership check, stale cleanup, then reserve_knowledge_source under the plan's limit. */
async function reserve(
  projectId: string,
  { title, type, storageKey }: Reservation,
): Promise<{ supabase: ServiceClient; row: SourceRow }> {
  await requireOwnedProject(projectId);
  const account = await ensureAccount();
  const supabase = createServiceClient();
  await removeStaleUploads(supabase, projectId);

  const { data, error } = await supabase.rpc("reserve_knowledge_source", {
    p_project_id: projectId,
    p_title: title,
    p_type: type,
    // Null for pasted text; the generated Args type can't say so.
    p_storage_key: storageKey as string,
    p_status: type === "text" ? "processing" : "uploading",
    p_limit: PLAN_LIMITS[account.plan].knowledgeSources,
  });
  if (error) {
    if (error.message === "plan_limit_reached") {
      const limit = PLAN_LIMITS[account.plan].knowledgeSources;
      throw new ProjectApiError(
        "plan_limit_reached",
        account.plan === "free"
          ? `The Free plan includes ${limit} knowledge sources per project. Upgrade to Pro for more.`
          : `You've reached your plan's limit of ${limit} knowledge sources per project.`,
      );
    }
    // The project was deleted between the check and the reservation.
    if (error.message === "not_found") throw projectNotFound();
    throw dbError("reserve", error);
  }
  return { supabase, row: data };
}

/** POST /api/projects/:id/knowledge: a `text` source, already `processing`. */
export async function createTextSource(
  projectId: string,
  input: CreateTextKnowledgeRequest,
): Promise<KnowledgeSource> {
  const { row } = await reserve(projectId, {
    title: input.title,
    type: "text",
    storageKey: null,
  });
  return toKnowledgeSource(row);
}

/**
 * A storage-safe file name: ASCII letters, digits, `.`, `_` and `-` only,
 * at most MAX_STORAGE_NAME_LENGTH before the extension, which is always the
 * allowed type's own (`.pdf`, `.md`, `.txt`) in lower case.
 */
export function safeFileName(fileName: string): string {
  const type = knowledgeFileTypeFromName(fileName);
  if (!type) throw new Error("safeFileName: not an allowed file type");
  const base = fileName
    .slice(0, fileName.lastIndexOf("."))
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, MAX_STORAGE_NAME_LENGTH)
    .replace(/[._-]+$/g, "");
  return `${base || "file"}.${type}`;
}

/** `<projectId>/<sourceId>/<safe file name>` */
export function storageKey(projectId: string, sourceId: string, fileName: string): string {
  return `${projectId}/${sourceId}/${safeFileName(fileName)}`;
}

/**
 * POST /api/projects/:id/knowledge/upload-url: reserves an `uploading` source
 * and returns a one-time signed upload URL for its storage key. The zod
 * schema has already checked the declared size, extension and MIME type.
 */
export async function createUploadSource(
  projectId: string,
  input: KnowledgeUploadUrlRequest,
): Promise<KnowledgeUploadUrlResponse> {
  const type = knowledgeFileTypeFromName(input.fileName);
  if (!type) {
    throw new ProjectApiError(
      "unsupported_file_type",
      "Only PDF, Markdown and TXT files are allowed.",
    );
  }

  // The key holds the source id, which only exists once the row does: reserve
  // under a unique placeholder, then set the real key on that row.
  const placeholder = storageKey(projectId, crypto.randomUUID(), input.fileName);
  const { supabase, row } = await reserve(projectId, {
    title: input.title,
    type,
    storageKey: placeholder,
  });

  try {
    const key = storageKey(projectId, row.id, input.fileName);
    const { data: updated, error } = await supabase
      .from("knowledge_sources")
      .update({ storage_key: key })
      .eq("id", row.id)
      .eq("project_id", projectId)
      .select(COLUMNS)
      .single();
    if (error) throw dbError("set storage key", error);

    const { data: signed, error: signError } = await supabase.storage
      .from(KNOWLEDGE_BUCKET)
      .createSignedUploadUrl(key);
    if (signError) throw dbError("signed upload url", signError);

    return { source: toKnowledgeSource(updated), uploadUrl: signed.signedUrl };
  } catch (error) {
    // Don't leave a reservation counting toward the limit with no way to upload.
    await deleteSourceRow(supabase, row.id, projectId);
    throw error;
  }
}

/** True when Storage said the object isn't there. */
function isMissingObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as { code?: unknown; status?: unknown; statusCode?: unknown };
  return e.code === "NoSuchKey" || e.status === 404 || e.statusCode === "404";
}

async function deleteSourceRow(
  supabase: ServiceClient,
  sourceId: string,
  projectId: string,
): Promise<void> {
  const { error } = await supabase
    .from("knowledge_sources")
    .delete()
    .eq("id", sourceId)
    .eq("project_id", projectId);
  if (error) console.error(dbError("delete source", error).message);
}

/** Removes the object and the source; then the refusal. */
async function refuse(
  supabase: ServiceClient,
  row: SourceRow,
  refusal: ProjectApiError,
): Promise<never> {
  if (row.storage_key) {
    const { error } = await supabase.storage
      .from(KNOWLEDGE_BUCKET)
      .remove([row.storage_key]);
    if (error) console.error(dbError("remove refused file", error).message);
  }
  await deleteSourceRow(supabase, row.id, row.project_id);
  throw refusal;
}

/**
 * POST /api/projects/:id/knowledge/finalize: claims the upload once
 * (`uploading` → `processing`), then checks the real object: its size, and
 * for a PDF its `%PDF-` magic bytes. A refused file and its source are
 * deleted. Returns the claimed source; the route then processes it.
 */
export async function finalizeSource(
  projectId: string,
  sourceId: string,
): Promise<KnowledgeSource> {
  await requireOwnedProject(projectId);
  const supabase = createServiceClient();

  // One conditional update: of two concurrent finalizes only one gets the row.
  // A stale reservation can't be claimed: the next reservation deletes it.
  const { data: row, error } = await supabase
    .from("knowledge_sources")
    .update({ status: "processing" })
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .eq("status", "uploading")
    .gte("created_at", staleCutoff())
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw dbError("claim", error);
  if (!row) throw await claimRefusal(projectId, sourceId);

  if (!row.storage_key) {
    return refuse(
      supabase,
      row,
      new ProjectApiError("unsupported_file_type", "This source isn't a file."),
    );
  }

  const bucket = supabase.storage.from(KNOWLEDGE_BUCKET);
  const { data: info, error: infoError } = await bucket.info(row.storage_key);
  if (infoError) {
    if (isMissingObject(infoError)) {
      // Not uploaded yet: hand the reservation back so the upload can finish.
      await unclaim(supabase, row);
      throw new ProjectApiError(
        "invalid_request",
        "Upload the file before finalizing it.",
      );
    }
    await unclaim(supabase, row);
    throw dbError("object info", infoError);
  }

  if (typeof info.size !== "number" || info.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return refuse(
      supabase,
      row,
      new ProjectApiError(
        "file_too_large",
        `Files can be at most ${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)} MB.`,
      ),
    );
  }

  if (row.type === "pdf" && !(await startsWithPdfMagic(supabase, row))) {
    return refuse(
      supabase,
      row,
      new ProjectApiError(
        "unsupported_file_type",
        "This file isn't a PDF. Upload a PDF, Markdown or TXT file.",
      ),
    );
  }

  return toKnowledgeSource(row);
}

/** Why the claim matched no row: 404 if the owner can't see the source, else 409. */
async function claimRefusal(
  projectId: string,
  sourceId: string,
): Promise<ProjectApiError> {
  const { data, error } = await createOwnerClient()
    .from("knowledge_sources")
    .select("id, status")
    .eq("id", sourceId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return new ProjectApiError("internal_error", "Something went wrong.");
  if (!data) return sourceNotFound();
  if (data.status === "uploading") {
    return new ProjectApiError(
      "conflict",
      "This upload expired. Upload the file again.",
    );
  }
  return new ProjectApiError("conflict", "This file was already finalized.");
}

/** Best effort: puts a claimed source back to `uploading`. */
async function unclaim(supabase: ServiceClient, row: SourceRow): Promise<void> {
  const { error } = await supabase
    .from("knowledge_sources")
    .update({ status: "uploading" })
    .eq("id", row.id)
    .eq("project_id", row.project_id)
    .eq("status", "processing");
  if (error) console.error(dbError("unclaim", error).message);
}

async function startsWithPdfMagic(
  supabase: ServiceClient,
  row: SourceRow,
): Promise<boolean> {
  const { data, error } = await supabase.storage
    .from(KNOWLEDGE_BUCKET)
    .download(row.storage_key!);
  if (error || !data) {
    await unclaim(supabase, row);
    throw dbError("download", error);
  }
  const head = new Uint8Array(await data.slice(0, PDF_MAGIC.length).arrayBuffer());
  return String.fromCharCode(...head) === PDF_MAGIC;
}

/**
 * DELETE /api/knowledge/:id: the owner client finds the source (RLS scopes
 * it), then the service client removes its file and its row; the chunks
 * cascade.
 */
export async function deleteSource(sourceId: string): Promise<void> {
  const { data: row, error } = await createOwnerClient()
    .from("knowledge_sources")
    .select("id, project_id, storage_key")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) throw dbError("read source", error);
  if (!row) throw sourceNotFound();

  const supabase = createServiceClient();
  if (row.storage_key) {
    const { error: removeError } = await supabase.storage
      .from(KNOWLEDGE_BUCKET)
      .remove([row.storage_key]);
    // Keep the row so a retry can still find and remove the file.
    if (removeError) throw dbError("remove file", removeError);
  }

  const { error: deleteError } = await supabase
    .from("knowledge_sources")
    .delete()
    .eq("id", row.id)
    .eq("project_id", row.project_id);
  if (deleteError) throw dbError("delete source", deleteError);
}
