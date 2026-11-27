import "server-only";
import type { KnowledgeFileType } from "@askwell/shared";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export type ExtractErrorCode = "empty" | "unreadable";

/** A file that has no text (`empty`) or can't be read (`unreadable`). */
export class ExtractError extends Error {
  readonly code: ExtractErrorCode;

  constructor(code: ExtractErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExtractError";
    this.code = code;
  }
}

/**
 * The text of an uploaded file: PDF (unpdf, all pages) or Markdown / TXT
 * (UTF-8; invalid UTF-8 is unreadable). Throws ExtractError when the file
 * can't be read or holds no text, such as a scanned PDF without a text layer.
 */
export async function extractText(
  data: Uint8Array,
  type: KnowledgeFileType,
): Promise<string> {
  const text = type === "pdf" ? await readPdf(data) : readUtf8(data);
  if (text.trim() === "") {
    throw new ExtractError("empty", `The ${type} file has no text`);
  }
  return text;
}

function readUtf8(data: Uint8Array): string {
  try {
    // fatal: invalid UTF-8 throws instead of becoming U+FFFD. The BOM is dropped.
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  } catch (cause) {
    throw new ExtractError("unreadable", "The file is not valid UTF-8 text", { cause });
  }
}

async function readPdf(data: Uint8Array): Promise<string> {
  try {
    // PDF.js may take ownership of the buffer, so give it a copy.
    const pdf = await getDocumentProxy(new Uint8Array(data));
    try {
      const { text } = await extractPdfText(pdf, { mergePages: true });
      return text;
    } finally {
      // Frees the document and its worker (PDFDocumentProxy has no destroy()).
      await pdf.loadingTask.destroy();
    }
  } catch (cause) {
    throw new ExtractError("unreadable", "The PDF could not be read", { cause });
  }
}
