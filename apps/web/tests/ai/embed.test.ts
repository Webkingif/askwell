import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => import("./sdk-mock"));

const sdk = await import("./sdk-mock");
const { embedTexts, embedDocuments, embedQuery, EMBED_BATCH_SIZE } =
  await import("../../lib/ai/embed");
const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } =
  await import("../../lib/ai/models");

type EmbedArgs = {
  model: string;
  contents: string[];
  config: { taskType: string; outputDimensionality: number };
};

const vector = (fill: number, length = EMBEDDING_DIMENSIONS) =>
  Array.from({ length }, () => fill);

/** Answers each request with one vector per text; the fill is its index. */
function echoVectors() {
  let n = 0;
  sdk.embedContent.mockImplementation(async ({ contents }: EmbedArgs) => ({
    embeddings: contents.map(() => ({ values: vector(n++) })),
  }));
}

const calls = () => sdk.embedContent.mock.calls.map(([a]) => a as EmbedArgs);

beforeEach(() => vi.stubEnv("GEMINI_API_KEY", "test-key"));
afterEach(() => {
  vi.unstubAllEnvs();
  sdk.embedContent.mockReset();
});

describe("embedTexts", () => {
  it("uses gemini-embedding-001 at 1536 dims", async () => {
    expect(EMBEDDING_MODEL).toBe("gemini-embedding-001");
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    echoVectors();
    const vectors = await embedTexts(["a"]);
    expect(vectors).toHaveLength(1);
    expect(vectors[0]).toHaveLength(1536);
    expect(calls()[0]).toMatchObject({
      model: "gemini-embedding-001",
      contents: ["a"],
      config: { outputDimensionality: 1536, taskType: "RETRIEVAL_DOCUMENT" },
    });
    expect(sdk.constructed.at(-1)).toEqual({ apiKey: "test-key" });
  });

  it("batches to the per-request limit and keeps the order", async () => {
    echoVectors();
    const texts = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const vectors = await embedTexts(texts);
    expect(calls().map((c) => c.contents.length)).toEqual([
      EMBED_BATCH_SIZE,
      EMBED_BATCH_SIZE,
      50,
    ]);
    expect(calls()[1].contents[0]).toBe("t100");
    expect(vectors.map((v) => v[0])).toEqual(texts.map((_, i) => i));
  });

  it("makes no call for no texts", async () => {
    expect(await embedTexts([])).toEqual([]);
    expect(sdk.embedContent).not.toHaveBeenCalled();
  });

  it.each([768, 3072, 0])("refuses a %i-dim vector", async (length) => {
    sdk.embedContent.mockResolvedValue({
      embeddings: [{ values: vector(0.1, length) }],
    });
    await expect(embedTexts(["a"])).rejects.toThrow(
      `expected 1536 dimensions, got ${length}`,
    );
  });

  it("refuses a missing vector", async () => {
    sdk.embedContent.mockResolvedValue({ embeddings: [{}] });
    await expect(embedTexts(["a"])).rejects.toThrow(/1536 dimensions, got 0/);
  });

  it("refuses the wrong number of vectors", async () => {
    sdk.embedContent.mockResolvedValue({ embeddings: [{ values: vector(0) }] });
    await expect(embedTexts(["a", "b"])).rejects.toThrow(
      /expected 2 vectors, got 1/,
    );
  });

  it("refuses non-finite values", async () => {
    const bad = vector(0.1);
    bad[5] = Number.NaN;
    sdk.embedContent.mockResolvedValue({ embeddings: [{ values: bad }] });
    await expect(embedTexts(["a"])).rejects.toThrow(/non-finite/);
  });

  it("errors before any call when the key is missing", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(embedTexts(["a"])).rejects.toThrow(
      /GEMINI_API_KEY is not set/,
    );
    expect(sdk.embedContent).not.toHaveBeenCalled();
  });
});

describe("task types", () => {
  it("sends documents as RETRIEVAL_DOCUMENT", async () => {
    echoVectors();
    await embedDocuments(["doc"]);
    expect(calls()[0].config.taskType).toBe("RETRIEVAL_DOCUMENT");
  });

  it("sends the question as RETRIEVAL_QUERY and returns one vector", async () => {
    echoVectors();
    const v = await embedQuery("How do refunds work?");
    expect(v).toHaveLength(1536);
    expect(calls()[0]).toMatchObject({
      contents: ["How do refunds work?"],
      config: { taskType: "RETRIEVAL_QUERY" },
    });
  });
});
