import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSupabase } from "./fake-supabase";
import { makePdf } from "./pdf";

vi.mock("server-only", () => ({}));

let db: FakeSupabase;
vi.mock("../../lib/supabase/service", () => ({
  createServiceClient: () => db,
}));

const embedDocuments = vi.fn<(texts: string[]) => Promise<number[][]>>();
vi.mock("../../lib/ai/embed", () => ({
  embedDocuments: (texts: string[]) => embedDocuments(texts),
}));

const { processSource, KNOWLEDGE_BUCKET, CHUNK_INSERT_BATCH } = await import(
  "../../lib/knowledge/process"
);
const { CHARS_PER_TOKEN, CHUNK_TOKENS } = await import("../../lib/knowledge/chunk");

const PROJECT = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_PROJECT = "bbbbbbbb-0000-4000-8000-000000000001";
const SOURCE = "aaaaaaaa-0000-4000-8000-000000000002";
const OTHER_SOURCE = "bbbbbbbb-0000-4000-8000-000000000002";

/** One 1536-dim vector per text, first value = its index. */
const fakeVectors = async (texts: string[]) =>
  texts.map((_, i) => {
    const v = Array<number>(1536).fill(0);
    v[0] = i + 1;
    return v;
  });

function addSource(
  over: Partial<{ id: string; project_id: string; type: string; storage_key: string | null; status: string }> = {},
) {
  const row = {
    id: SOURCE,
    project_id: PROJECT,
    title: "FAQ",
    type: "text",
    storage_key: null,
    status: "processing",
    ...over,
  };
  db.tables.knowledge_sources!.push(row);
  return row;
}

const source = (id = SOURCE) => db.rows("knowledge_sources", { id })[0]!;
const chunks = (where = {}) => db.rows("knowledge_chunks", where);

let errors: string[];
beforeEach(() => {
  db = new FakeSupabase();
  embedDocuments.mockReset();
  embedDocuments.mockImplementation(fakeVectors);
  errors = [];
  vi.spyOn(console, "error").mockImplementation((msg: unknown) => {
    errors.push(String(msg));
  });
});
afterEach(() => vi.restoreAllMocks());

describe("processSource: ready", () => {
  it("chunks and embeds pasted text, stores the chunks and sets ready", async () => {
    addSource();
    const result = await processSource(SOURCE, { text: "  We ship   worldwide.  " });
    expect(result).toEqual({ status: "ready", chunks: 1 });
    expect(embedDocuments).toHaveBeenCalledWith(["We ship worldwide."]);
    expect(chunks()).toEqual([
      expect.objectContaining({
        project_id: PROJECT,
        source_id: SOURCE,
        content: "We ship worldwide.",
        embedding: `[1,${Array(1535).fill(0).join(",")}]`,
      }),
    ]);
    expect(source().status).toBe("ready");
  });

  it("downloads a file from the knowledge bucket by its storage key", async () => {
    addSource({ type: "pdf", storage_key: `${PROJECT}/guide.pdf` });
    db.files.set(
      `knowledge/${PROJECT}/guide.pdf`,
      makePdf([["Refunds within 30 days."], ["Shipping takes 5 days."]]),
    );
    const result = await processSource(SOURCE);
    expect(result).toEqual({ status: "ready", chunks: 1 });
    expect(db.buckets).toEqual([KNOWLEDGE_BUCKET]);
    expect(KNOWLEDGE_BUCKET).toBe("knowledge");
    expect(chunks()[0]!.content).toContain("Refunds within 30 days.");
    expect(chunks()[0]!.content).toContain("Shipping takes 5 days.");
    expect(source().status).toBe("ready");
  });

  it.each(["md", "txt"] as const)("processes a %s file", async (type) => {
    addSource({ type, storage_key: `${PROJECT}/notes.${type}` });
    db.files.set(`knowledge/${PROJECT}/notes.${type}`, new TextEncoder().encode("# Hours\n\nOpen 9–5."));
    expect(await processSource(SOURCE)).toEqual({ status: "ready", chunks: 1 });
    expect(chunks()[0]!.content).toBe("# Hours\n\nOpen 9–5.");
  });

  it("stores many chunks in batches, in order, each with its own vector", async () => {
    addSource();
    const sentence = "This sentence fills up the chunk with plenty of words. ";
    const text = sentence.repeat(Math.ceil((CHUNK_TOKENS * CHARS_PER_TOKEN * 150) / sentence.length));
    const result = await processSource(SOURCE, { text });
    expect(result.status).toBe("ready");
    const stored = chunks();
    expect(stored.length).toBeGreaterThan(CHUNK_INSERT_BATCH);
    expect(result).toEqual({ status: "ready", chunks: stored.length });
    stored.forEach((c, i) => expect(String(c.embedding).startsWith(`[${i + 1},`)).toBe(true));
  });

  it("replaces chunks left by an earlier attempt", async () => {
    addSource();
    db.tables.knowledge_chunks!.push({ id: "old", project_id: PROJECT, source_id: SOURCE, content: "stale" });
    await processSource(SOURCE, { text: "Fresh text." });
    expect(chunks().map((c) => c.content)).toEqual(["Fresh text."]);
  });
});

describe("processSource: project scoping", () => {
  it("gives every chunk the source's own project_id and leaves other projects alone", async () => {
    addSource();
    addSource({ id: OTHER_SOURCE, project_id: OTHER_PROJECT, status: "ready" });
    db.tables.knowledge_chunks!.push({
      id: "other",
      project_id: OTHER_PROJECT,
      source_id: OTHER_SOURCE,
      content: "Other project's chunk",
    });

    const text = Array.from({ length: 300 }, (_, i) => `Fact number ${i} about our shop.`).join(" ");
    await processSource(SOURCE, { text });

    const mine = chunks({ source_id: SOURCE });
    expect(mine.length).toBeGreaterThan(1);
    expect(mine.every((c) => c.project_id === PROJECT)).toBe(true);
    expect(chunks({ project_id: OTHER_PROJECT })).toEqual([
      expect.objectContaining({ id: "other", content: "Other project's chunk" }),
    ]);
    expect(source(OTHER_SOURCE).status).toBe("ready");
  });
});

describe("processSource: failed", () => {
  const failed = async (reason: string) => {
    expect(source().status).toBe("failed");
    expect(chunks({ source_id: SOURCE })).toEqual([]);
    expect(errors.some((e) => e.includes(SOURCE) && e.includes(reason))).toBe(true);
  };

  it("fails a text source called without its text", async () => {
    addSource();
    expect(await processSource(SOURCE)).toEqual({ status: "failed", reason: "missing_text" });
    await failed("missing_text");
    expect(embedDocuments).not.toHaveBeenCalled();
  });

  it("fails pasted text that is only whitespace", async () => {
    addSource();
    expect(await processSource(SOURCE, { text: " \n\n " })).toEqual({ status: "failed", reason: "empty" });
    await failed("empty");
  });

  it("fails a file source without a storage key or whose download fails", async () => {
    addSource({ type: "pdf", storage_key: null });
    expect(await processSource(SOURCE)).toEqual({ status: "failed", reason: "missing_file" });
    await failed("missing_file");

    db = new FakeSupabase({ fail: ["storage.download"] });
    addSource({ type: "txt", storage_key: `${PROJECT}/a.txt` });
    expect(await processSource(SOURCE)).toEqual({ status: "failed", reason: "missing_file" });
    await failed("missing_file");
  });

  it("fails an unreadable or empty file", async () => {
    addSource({ type: "pdf", storage_key: `${PROJECT}/bad.pdf` });
    db.files.set(`knowledge/${PROJECT}/bad.pdf`, new TextEncoder().encode("not a pdf"));
    expect(await processSource(SOURCE)).toEqual({ status: "failed", reason: "unreadable" });
    await failed("unreadable");

    db = new FakeSupabase();
    addSource({ type: "pdf", storage_key: `${PROJECT}/scan.pdf` });
    db.files.set(`knowledge/${PROJECT}/scan.pdf`, makePdf([[]]));
    expect(await processSource(SOURCE)).toEqual({ status: "failed", reason: "empty" });
    await failed("empty");
  });

  it("fails when embedding throws, storing no chunks", async () => {
    addSource();
    embedDocuments.mockRejectedValue(new Error("Gemini 429"));
    expect(await processSource(SOURCE, { text: "Hello." })).toEqual({
      status: "failed",
      reason: "embed_failed",
    });
    await failed("Gemini 429");
  });

  it("fails when embedding returns the wrong number of vectors", async () => {
    addSource();
    embedDocuments.mockResolvedValue([]);
    expect(await processSource(SOURCE, { text: "Hello." })).toEqual({
      status: "failed",
      reason: "embed_failed",
    });
    await failed("embed_failed");
  });

  it("removes chunks already inserted when a later batch fails", async () => {
    addSource();
    let inserts = 0;
    const realFrom = db.from.bind(db);
    db.from = (table: string) => {
      const q = realFrom(table);
      if (table !== "knowledge_chunks") return q;
      const insert = q.insert.bind(q);
      q.insert = (rows) => {
        inserts++;
        if (inserts === 2) db.fail.add("knowledge_chunks.insert");
        return insert(rows);
      };
      return q;
    };
    const sentence = "Plenty of words go into this sentence to fill the chunks. ";
    const text = sentence.repeat(Math.ceil((CHUNK_TOKENS * CHARS_PER_TOKEN * 150) / sentence.length));
    expect(await processSource(SOURCE, { text })).toEqual({ status: "failed", reason: "store_failed" });
    expect(inserts).toBe(2);
    await failed("knowledge_chunks.insert failed");
  });

  it("fails when setting ready fails, and leaves no chunks", async () => {
    addSource();
    let updates = 0;
    const realFrom = db.from.bind(db);
    db.from = (table: string) => {
      const q = realFrom(table);
      if (table !== "knowledge_sources") return q;
      const update = q.update.bind(q);
      q.update = (values) => {
        // The first update (ready) fails; the second (failed) goes through.
        if (++updates === 1) db.fail.add("knowledge_sources.update");
        else db.fail.delete("knowledge_sources.update");
        return update(values);
      };
      return q;
    };
    expect(await processSource(SOURCE, { text: "Hello." })).toEqual({
      status: "failed",
      reason: "store_failed",
    });
    await failed("store_failed");
  });

  it("never throws, even when cleanup fails too", async () => {
    db = new FakeSupabase({
      fail: ["knowledge_chunks.insert", "knowledge_chunks.delete", "knowledge_sources.update"],
    });
    addSource();
    await expect(processSource(SOURCE, { text: "Hello." })).resolves.toEqual({
      status: "failed",
      reason: "store_failed",
    });
    expect(source().status).toBe("processing");
  });

  it("never throws when the source can't be loaded", async () => {
    db = new FakeSupabase({ fail: ["knowledge_sources.select"] });
    await expect(processSource(SOURCE, { text: "x" })).resolves.toEqual({
      status: "failed",
      reason: "store_failed",
    });
  });

  it("never logs the source's text", async () => {
    addSource();
    embedDocuments.mockRejectedValue(new Error("boom"));
    await processSource(SOURCE, { text: "Secret internal pricing: 42." });
    expect(errors.join("\n")).not.toContain("Secret internal pricing");
  });
});

describe("processSource: not processed", () => {
  it("reports an unknown source without writing anything", async () => {
    expect(await processSource(SOURCE, { text: "x" })).toEqual({ status: "failed", reason: "not_found" });
    expect(chunks()).toEqual([]);
  });

  it.each(["uploading", "ready", "failed"])("leaves a %s source untouched", async (status) => {
    addSource({ status });
    db.tables.knowledge_chunks!.push({ id: "c", project_id: PROJECT, source_id: SOURCE, content: "kept" });
    expect(await processSource(SOURCE, { text: "New." })).toEqual({
      status: "failed",
      reason: "not_processing",
    });
    expect(source().status).toBe(status);
    expect(chunks().map((c) => c.content)).toEqual(["kept"]);
    expect(embedDocuments).not.toHaveBeenCalled();
  });
});
