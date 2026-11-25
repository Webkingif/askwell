// Owner routes: knowledge sources (project.md §6.4, §8).
import { z } from "zod";
import {
  MAX_FILE_NAME_LENGTH,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_KNOWLEDGE_TEXT_LENGTH,
  MAX_KNOWLEDGE_TITLE_LENGTH,
} from "../constants";
import {
  KNOWLEDGE_FILE_MIME_TYPES,
  KNOWLEDGE_FILE_TYPES,
  type KnowledgeFileType,
  type KnowledgeSourceStatus,
  type KnowledgeSourceType,
} from "../enums";
import { knowledgeMimeTypeSchema } from "../schemas";
import { idSchema, type IsoDateString } from "./common";

export interface KnowledgeSource {
  id: string;
  projectId: string;
  title: string;
  type: KnowledgeSourceType;
  status: KnowledgeSourceStatus;
  createdAt: IsoDateString;
}

const titleSchema = z.string().trim().min(1).max(MAX_KNOWLEDGE_TITLE_LENGTH);

/** The file type a name's extension stands for, or null if not allowed. */
export function knowledgeFileTypeFromName(
  fileName: string,
): KnowledgeFileType | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const types: readonly string[] = KNOWLEDGE_FILE_TYPES;
  return types.includes(ext) ? (ext as KnowledgeFileType) : null;
}

/** POST /api/projects/:id/knowledge: paste text. Params: `idParamsSchema`. */
export const createTextKnowledgeRequestSchema = z.object({
  title: titleSchema,
  text: z.string().trim().min(1).max(MAX_KNOWLEDGE_TEXT_LENGTH),
});
export type CreateTextKnowledgeRequest = z.infer<
  typeof createTextKnowledgeRequestSchema
>;
export interface CreateTextKnowledgeResponse {
  source: KnowledgeSource;
}

/** POST /api/projects/:id/knowledge/upload-url: reserve a file source. Params: `idParamsSchema`. */
export const knowledgeUploadUrlRequestSchema = z
  .object({
    title: titleSchema,
    fileName: z.string().trim().min(1).max(MAX_FILE_NAME_LENGTH),
    contentType: knowledgeMimeTypeSchema,
    sizeBytes: z.int().min(1).max(MAX_KNOWLEDGE_FILE_BYTES),
  })
  .superRefine((value, ctx) => {
    const type = knowledgeFileTypeFromName(value.fileName);
    if (type === null) {
      ctx.addIssue({
        code: "custom",
        path: ["fileName"],
        message: "Only PDF, Markdown and TXT files are allowed",
      });
      return;
    }
    const mimes: readonly string[] = KNOWLEDGE_FILE_MIME_TYPES[type];
    if (!mimes.includes(value.contentType)) {
      ctx.addIssue({
        code: "custom",
        path: ["contentType"],
        message: "The content type does not match the file extension",
      });
    }
  });
export type KnowledgeUploadUrlRequest = z.infer<
  typeof knowledgeUploadUrlRequestSchema
>;
export interface KnowledgeUploadUrlResponse {
  /** The reserved source, status `uploading`. */
  source: KnowledgeSource;
  /** One-time signed Storage URL; the browser uploads the file straight to it. */
  uploadUrl: string;
}

/** POST /api/projects/:id/knowledge/finalize. Params: `idParamsSchema`. */
export const finalizeKnowledgeRequestSchema = z.object({ sourceId: idSchema });
export type FinalizeKnowledgeRequest = z.infer<
  typeof finalizeKnowledgeRequestSchema
>;
export interface FinalizeKnowledgeResponse {
  /** The source after the claim: `processing`, then `ready` or `failed`. */
  source: KnowledgeSource;
}

/** DELETE /api/knowledge/:id. Params: `idParamsSchema`. Returns `OkResponse`. */
