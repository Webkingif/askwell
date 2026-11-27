import { describe, expect, it } from "vitest";
import { MAX_KNOWLEDGE_FILE_BYTES } from "@askwell/shared";
import {
  FAILED_PDF_HINT,
  MAX_PDF_PAGES,
  MAX_PDF_PAGES_HINT,
  checkFile,
  formatSize,
} from "../../components/knowledge/files";

const file = (name: string, size: number, type = "") => ({ name, size, type });

describe("checkFile", () => {
  it("accepts PDF, Markdown and TXT, declaring the extension's type", () => {
    expect(checkFile(file("a.pdf", 10, "application/pdf"))).toEqual({
      ok: true,
      contentType: "application/pdf",
    });
    expect(checkFile(file("a.txt", 10, "text/plain"))).toEqual({
      ok: true,
      contentType: "text/plain",
    });
    // Browsers often give .md no type, or an odd one.
    expect(checkFile(file("a.md", 10, ""))).toEqual({
      ok: true,
      contentType: "text/markdown",
    });
    expect(checkFile(file("a.md", 10, "text/x-markdown"))).toEqual({
      ok: true,
      contentType: "text/x-markdown",
    });
    expect(checkFile(file("A.PDF", 10, "application/octet-stream"))).toEqual({
      ok: true,
      contentType: "application/pdf",
    });
  });

  it("refuses a .docx and other types", () => {
    for (const name of ["a.docx", "a.exe", "noext", "a.pdf.zip"]) {
      expect(checkFile(file(name, 10))).toMatchObject({
        ok: false,
        code: "unsupported_file_type",
      });
    }
  });

  it("refuses a 12 MB file and accepts exactly the limit", () => {
    expect(
      checkFile(file("big.pdf", 12 * 1024 * 1024, "application/pdf")),
    ).toEqual({
      ok: false,
      code: "file_too_large",
      message: "This file is 12.0 MB. Files can be at most 10 MB.",
    });
    expect(
      checkFile(file("max.pdf", MAX_KNOWLEDGE_FILE_BYTES, "application/pdf"))
        .ok,
    ).toBe(true);
  });

  it("refuses an empty file", () => {
    expect(checkFile(file("a.txt", 0))).toMatchObject({
      ok: false,
      code: "empty_file",
    });
  });
});

describe("formatSize", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(2048)).toBe("2 KB");
    expect(formatSize(5.5 * 1024 * 1024)).toBe("5.5 MB");
  });
});

describe("PDF page hints", () => {
  it("both name the same page limit", () => {
    expect(MAX_PDF_PAGES).toBe(100);
    expect(MAX_PDF_PAGES_HINT).toBe(
      "Keep PDFs under 100 pages. Split longer documents into several files.",
    );
    expect(FAILED_PDF_HINT).toContain(`under ${MAX_PDF_PAGES} pages`);
  });
});
