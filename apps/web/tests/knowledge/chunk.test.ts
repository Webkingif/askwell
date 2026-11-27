import { describe, expect, it } from "vitest";
import {
  CHARS_PER_TOKEN,
  CHUNK_OVERLAP_TOKENS,
  CHUNK_TOKENS,
  chunkText,
  MAX_CHUNKS_PER_SOURCE,
  normalizeText,
} from "../../lib/knowledge/chunk";

const MAX = CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP = CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN;

/** n distinct sentences: "Sentence 1 is about topic 1." … */
const sentences = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => `Sentence ${i + from} is about topic ${i + from}.`);

describe("chunk sizes", () => {
  it("are ~800 tokens with ~100 overlap, estimated by characters", () => {
    expect(MAX).toBe(3200);
    expect(OVERLAP).toBe(400);
    expect(MAX_CHUNKS_PER_SOURCE).toBe(500);
  });
});

describe("normalizeText", () => {
  it("collapses spaces and tabs, trims lines, keeps at most one blank line", () => {
    expect(normalizeText("  Hello\t\t world  \r\n\r\n\r\n\r\nNext   line here  ")).toBe(
      "Hello world\n\nNext line here",
    );
  });

  it("removes NUL bytes", () => {
    expect(normalizeText("a\u0000b")).toBe("ab");
  });
});

describe("chunkText", () => {
  it("gives no chunks for empty or whitespace-only text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("  \n\n\t \r\n ")).toEqual([]);
  });

  it("keeps one short paragraph as one normalized chunk", () => {
    expect(chunkText("  We ship   worldwide.\r\n")).toEqual(["We ship worldwide."]);
  });

  it("keeps short paragraphs together, separated by a blank line", () => {
    expect(chunkText("First.\n\n\n\nSecond.")).toEqual(["First.\n\nSecond."]);
  });

  it("splits a long paragraph on sentence breaks, every chunk within the limit", () => {
    const text = sentences(400).join(" ");
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX);
      expect(chunk).toMatch(/^Sentence \d+ /);
      expect(chunk).toMatch(/\.$/);
    }
    // Nothing is lost: every sentence is in some chunk.
    for (const s of sentences(400)) {
      expect(chunks.some((c) => c.includes(s))).toBe(true);
    }
  });

  it("overlaps consecutive chunks by up to the overlap size, from a sentence start", () => {
    const chunks = chunkText(sentences(400).join(" "));
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const next = chunks[i]!;
      // The longest start of `next` that ends `prev`.
      let shared = 0;
      for (let n = Math.min(prev.length, next.length); n > 0; n--) {
        if (prev.endsWith(next.slice(0, n))) {
          shared = n;
          break;
        }
      }
      expect(shared).toBeGreaterThan(OVERLAP / 2);
      expect(shared).toBeLessThanOrEqual(OVERLAP);
      expect(next.slice(0, shared)).toMatch(/^Sentence \d+/);
    }
  });

  it("uses no overlap when it is set to 0", () => {
    const chunks = chunkText(sentences(20).join(" "), { maxChars: 120, overlapChars: 0 });
    expect(chunks.join(" ")).toBe(sentences(20).join(" "));
  });

  it("splits a sentence longer than a chunk between words, and a huge word mid-word", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const chunks = chunkText(words, { maxChars: 50, overlapChars: 10 });
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(50);
    expect(chunks.join(" ")).toContain("word59");

    const huge = "x".repeat(130);
    const parts = chunkText(huge, { maxChars: 50, overlapChars: 0 });
    expect(parts).toEqual(["x".repeat(50), "x".repeat(50), "x".repeat(30)]);
  });

  it("caps the number of chunks per source", () => {
    const text = sentences(200).join("\n\n");
    const all = chunkText(text, { maxChars: 100, overlapChars: 20 });
    expect(all.length).toBeGreaterThan(10);
    const capped = chunkText(text, { maxChars: 100, overlapChars: 20, maxChunks: 10 });
    expect(capped).toEqual(all.slice(0, 10));
    expect(chunkText(text, { maxChunks: 0 })).toEqual([]);

    // The default cap holds for a huge input.
    const huge = chunkText(sentences(60_000).join(" "));
    expect(huge).toHaveLength(MAX_CHUNKS_PER_SOURCE);
  });

  it("drops empty chunks and never returns blank text", () => {
    const chunks = chunkText("\n\n\nA.\n\n   \n\nB.\n\n\n", { maxChars: 3, overlapChars: 0 });
    expect(chunks).toEqual(["A.", "B."]);
  });

  it("is pure: same input, same output, input unchanged", () => {
    const text = sentences(300).join(" ");
    const copy = `${text}`;
    expect(chunkText(text)).toEqual(chunkText(text));
    expect(text).toBe(copy);
  });

  it("rejects an overlap that isn't smaller than the chunk", () => {
    expect(() => chunkText("a", { maxChars: 10, overlapChars: 10 })).toThrow(RangeError);
    expect(() => chunkText("a", { maxChars: 0 })).toThrow(RangeError);
  });
});
