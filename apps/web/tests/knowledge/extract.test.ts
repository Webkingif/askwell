import { describe, expect, it, vi } from "vitest";
import { makePdf } from "./pdf";

vi.mock("server-only", () => ({}));

const { extractText, ExtractError } = await import("../../lib/knowledge/extract");

const utf8 = (s: string) => new TextEncoder().encode(s);

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

describe("extractText", () => {
  it("reads TXT as UTF-8", async () => {
    expect(await extractText(utf8("Opening hours: 9–5, Mon–Fri. Café ☕"), "txt")).toBe(
      "Opening hours: 9–5, Mon–Fri. Café ☕",
    );
  });

  it("reads Markdown as UTF-8 text and drops a BOM", async () => {
    const md = "# Shipping\n\n- We ship **worldwide**.\n";
    expect(await extractText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8(md)]), "md")).toBe(md);
  });

  it("reads every page of a PDF", async () => {
    const pdf = makePdf([
      ["Refund policy", "Refunds within 30 days."],
      ["Shipping (worldwide) takes 5 days."],
    ]);
    const text = await extractText(pdf, "pdf");
    expect(text).toContain("Refund policy");
    expect(text).toContain("Refunds within 30 days.");
    expect(text).toContain("Shipping (worldwide) takes 5 days.");
    expect(text.indexOf("Refund policy")).toBeLessThan(text.indexOf("Shipping"));
  });

  it("does not modify the caller's buffer", async () => {
    const pdf = makePdf([["Hello"]]);
    const copy = new Uint8Array(pdf);
    await extractText(pdf, "pdf");
    expect(pdf.byteLength).toBe(copy.byteLength);
    expect(pdf).toEqual(copy);
  });

  it.each([
    ["txt", utf8("")],
    ["txt", utf8(" \n\t \r\n")],
    ["md", utf8("\n\n")],
    ["pdf", makePdf([[]])],
  ] as const)("throws empty for a %s file with no text", async (type, data) => {
    const error = await rejection(extractText(data, type));
    expect(error).toBeInstanceOf(ExtractError);
    expect(error).toMatchObject({ code: "empty" });
  });

  it.each([
    ["txt", new Uint8Array([0x48, 0x69, 0xff, 0xfe])],
    ["md", new Uint8Array([0xc3, 0x28])],
    ["pdf", utf8("this is not a pdf")],
    ["pdf", new Uint8Array(0)],
  ] as const)("throws unreadable for a bad %s file", async (type, data) => {
    const error = await rejection(extractText(data, type));
    expect(error).toBeInstanceOf(ExtractError);
    expect(error).toMatchObject({ code: "unreadable" });
  });
});
