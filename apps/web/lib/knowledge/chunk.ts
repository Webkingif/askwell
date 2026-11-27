// Splits extracted text into overlapping chunks for embedding. Pure: no I/O.
//
// Sizes are in estimated tokens (CHARS_PER_TOKEN characters each), so a chunk
// stays well under gemini-embedding-001's 2,048-token input limit.

/** Rough characters per token for English text. */
export const CHARS_PER_TOKEN = 4;
/** Target chunk size, overlap included. */
export const CHUNK_TOKENS = 800;
/** Text repeated from the end of one chunk at the start of the next. */
export const CHUNK_OVERLAP_TOKENS = 100;
/** Most chunks kept per source, so a huge file can't run up embedding cost. */
export const MAX_CHUNKS_PER_SOURCE = 500;

export type ChunkOptions = {
  /** Max characters per chunk (default CHUNK_TOKENS * CHARS_PER_TOKEN). */
  maxChars?: number;
  /** Overlap in characters (default CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN). */
  overlapChars?: number;
  /** Most chunks returned (default MAX_CHUNKS_PER_SOURCE). */
  maxChunks?: number;
};

/**
 * Normalizes whitespace: CRLF to LF, runs of spaces and tabs to one space,
 * trimmed lines, at most one blank line between paragraphs, no NUL bytes
 * (Postgres text can't hold them).
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A piece of text that is never split further, and what joins it to the previous one. */
type Unit = { text: string; sep: string };

/**
 * Splits text into chunks of at most `maxChars` characters, breaking on
 * paragraphs, then sentences, then words, and only mid-word for a word
 * longer than a chunk. Each chunk after the first starts with up to
 * `overlapChars` of the previous chunk's end, from a sentence or word start.
 * Empty input gives no chunks; at most `maxChunks` are returned.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? CHUNK_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = options.overlapChars ?? CHUNK_OVERLAP_TOKENS * CHARS_PER_TOKEN;
  const maxChunks = options.maxChunks ?? MAX_CHUNKS_PER_SOURCE;
  if (!(maxChars > 0) || overlapChars < 0 || overlapChars >= maxChars) {
    throw new RangeError("chunkText: need maxChars > overlapChars >= 0");
  }
  if (maxChunks <= 0) return [];

  const units = toUnits(normalizeText(text), maxChars);
  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    const joined = current === "" ? unit.text : current + unit.sep + unit.text;
    if (joined.length <= maxChars) {
      current = joined;
      continue;
    }
    chunks.push(current);
    if (chunks.length >= maxChunks) return chunks;
    // Start the next chunk with the overlap, shortened so the unit still fits.
    const room = maxChars - unit.text.length - unit.sep.length;
    const tail = overlapTail(current, Math.min(overlapChars, room));
    current = tail === "" ? unit.text : tail + unit.sep + unit.text;
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

/** Paragraphs, split into sentences and then words when longer than maxChars. */
function toUnits(text: string, maxChars: number): Unit[] {
  if (text === "") return [];
  const units: Unit[] = [];
  for (const paragraph of text.split("\n\n")) {
    const first = units.length === 0;
    const pieces =
      paragraph.length <= maxChars
        ? [paragraph]
        : splitSentences(paragraph).flatMap((s) =>
            s.length <= maxChars ? [s] : splitWords(s, maxChars),
          );
    pieces.forEach((piece, i) => {
      units.push({ text: piece, sep: i === 0 ? (first ? "" : "\n\n") : " " });
    });
  }
  return units;
}

/** Sentences end at . ! or ? followed by whitespace. */
function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** Pieces of at most maxChars, broken between words, or mid-word when a word is longer. */
function splitWords(sentence: string, maxChars: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const word of sentence.split(/\s+/)) {
    for (let start = 0; start < word.length; start += maxChars) {
      const part = word.slice(start, start + maxChars);
      const joined = current === "" ? part : `${current} ${part}`;
      if (joined.length <= maxChars) {
        current = joined;
      } else {
        pieces.push(current);
        current = part;
      }
    }
  }
  if (current !== "") pieces.push(current);
  return pieces;
}

/** The last ≤ max characters of text, starting at a sentence or word start. */
function overlapTail(text: string, max: number): string {
  if (max <= 0) return "";
  if (text.length <= max) return text;
  const tail = text.slice(text.length - max);
  const sentence = /[.!?]\s+/.exec(tail);
  if (sentence && sentence.index + sentence[0].length < tail.length) {
    return tail.slice(sentence.index + sentence[0].length);
  }
  const space = tail.search(/\s/);
  // Cutting mid-word at the start: drop the partial word.
  if (space !== -1 && space + 1 < tail.length) return tail.slice(space + 1).trimStart();
  return "";
}
