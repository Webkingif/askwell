// Client calls to the knowledge routes (P3K-T04). The server decides every
// limit and check; these helpers pass on what it says.
import {
  apiErrorSchema,
  type CreateTextKnowledgeResponse,
  type FinalizeKnowledgeResponse,
  type KnowledgeSource,
  type KnowledgeUploadUrlResponse,
} from "@askwell/shared";
import type { ApiResult } from "../projects";
import { checkFile } from "./files";

export type { ApiResult };

const NETWORK_ERROR = {
  ok: false,
  code: "network_error",
  message: "We couldn't reach the server. Check your connection and try again.",
} as const;

const FALLBACK_MESSAGE = "Something went wrong. Try again.";

async function call<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method,
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return NETWORK_ERROR;
  }
  const json: unknown = await res.json().catch(() => undefined);
  if (res.ok) return { ok: true, data: json as T };
  const parsed = apiErrorSchema.safeParse(json);
  return parsed.success
    ? { ok: false, ...parsed.data.error }
    : { ok: false, code: "internal_error", message: FALLBACK_MESSAGE };
}

const knowledgeUrl = (projectId: string, rest = "") =>
  `/api/projects/${encodeURIComponent(projectId)}/knowledge${rest}`;

export const knowledgeApi = {
  paste: (projectId: string, title: string, text: string) =>
    call<CreateTextKnowledgeResponse>(knowledgeUrl(projectId), {
      method: "POST",
      body: { title, text },
    }),
  uploadUrl: (
    projectId: string,
    body: {
      title: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    },
  ) =>
    call<KnowledgeUploadUrlResponse>(knowledgeUrl(projectId, "/upload-url"), {
      method: "POST",
      body,
    }),
  finalize: (projectId: string, sourceId: string) =>
    call<FinalizeKnowledgeResponse>(knowledgeUrl(projectId, "/finalize"), {
      method: "POST",
      body: { sourceId },
    }),
  remove: (sourceId: string) =>
    call<{ ok: true }>(`/api/knowledge/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    }),
};

export type UploadStage = "preparing" | "uploading" | "checking";

/**
 * The whole upload: reserve (upload-url) → PUT the file straight to Storage
 * on the signed URL → finalize. If the PUT fails, the reservation is deleted
 * so it stops counting toward the limit.
 */
export async function uploadFile(
  projectId: string,
  title: string,
  file: File,
  onStage: (stage: UploadStage) => void = () => {},
): Promise<ApiResult<{ source: KnowledgeSource }>> {
  const check = checkFile(file);
  if (!check.ok) {
    return {
      ok: false,
      code: check.code === "empty_file" ? "invalid_request" : check.code,
      message: check.message,
    };
  }

  onStage("preparing");
  const reserved = await knowledgeApi.uploadUrl(projectId, {
    title,
    fileName: file.name,
    contentType: check.contentType,
    sizeBytes: file.size,
  });
  if (!reserved.ok) return reserved;

  onStage("uploading");
  let put: Response | null = null;
  try {
    put = await fetch(reserved.data.uploadUrl, {
      method: "PUT",
      headers: { "content-type": check.contentType },
      body: file,
    });
  } catch {
    put = null;
  }
  if (!put?.ok) {
    await knowledgeApi.remove(reserved.data.source.id);
    return {
      ok: false,
      code: "network_error",
      message: "The upload didn't finish. Check your connection and try again.",
    };
  }

  onStage("checking");
  return knowledgeApi.finalize(projectId, reserved.data.source.id);
}
