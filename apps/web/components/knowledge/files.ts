// Quick browser-side checks on a picked file (project.md §6.4, §9 File upload).
// The server still decides: upload-url checks the declared size and type,
// finalize checks the real bytes.
import {
  KNOWLEDGE_FILE_MIME_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  knowledgeFileTypeFromName,
  type KnowledgeMimeType,
} from "@askwell/shared";

/** For the file input's `accept`. */
export const ACCEPT =
  ".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain";

export const MAX_FILE_MB = MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024);

export type FileCheck =
  | { ok: true; contentType: KnowledgeMimeType }
  | {
      ok: false;
      code: "unsupported_file_type" | "file_too_large" | "empty_file";
      message: string;
    };

/**
 * Whether a file may be uploaded, and the content type to declare for it.
 * The type comes from the extension: browsers often give Markdown no MIME
 * type, so the file's own `type` is used only when it fits the extension.
 */
export function checkFile(
  file: Pick<File, "name" | "size" | "type">,
): FileCheck {
  const type = knowledgeFileTypeFromName(file.name);
  if (!type) {
    return {
      ok: false,
      code: "unsupported_file_type",
      message: "Only PDF, Markdown (.md) and TXT files can be added.",
    };
  }
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      message: `This file is ${formatSize(file.size)}. Files can be at most ${MAX_FILE_MB} MB.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, code: "empty_file", message: "This file is empty." };
  }
  const mimes: readonly KnowledgeMimeType[] = KNOWLEDGE_FILE_MIME_TYPES[type];
  const own = mimes.find((m) => m === file.type);
  return { ok: true, contentType: own ?? mimes[0]! };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
