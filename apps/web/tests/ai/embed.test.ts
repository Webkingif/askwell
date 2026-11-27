import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@google/genai", () => import("./sdk-mock"));

const sdk = await import("./sdk-mock");
const embedModule = await import("../../lib/ai/embed");
const { embedTexts, embedDocuments, embedQuery, EMBED_BATCH_SIZE } =
  embedModule;
const { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } =
  await import("../../lib/ai/models");

type EmbedArgs = {
  model: string;
  contents: string[];
  config: { taskType: string; outputDimensionality: number };
};

const vector = (fill: number, length = EMBEDDING_DIMENSIONS) =>
  Array.from({ length }, () => fill);

/**
 * Answers each request with one vector per text. Each vector's first value
 * is (index + 1) and the rest are 1, so v[0] / v[1] survives normalizing.
 */
function echoVectors() {
  let n = 0;
  sdk.embedContent.mockImplementation(async ({ contents }: EmbedArgs) => ({
    embeddings: contents.map(() => {
      const values = vector(1);
      values[0] = ++n;
      return { values };
    }),
  }));
}

const length = (v: number[]) => Math.hypot(...v);

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
    expect(vectors.map((v) => Math.round(v[0] / v[1]))).toEqual(
      texts.map((_, i) => i + 1),
    );
  });

  it("returns unit vectors (001 does not normalize below 3072 dims)", async () => {
    sdk.embedContent.mockResolvedValue({
      embeddings: [{ values: vector(3) }],
    });
    const [v] = await embedTexts(["a"]);
    expect(length(v)).toBeCloseTo(1, 10);
    expect(v[0]).toBeCloseTo(1 / Math.sqrt(1536), 10);
  });

  it("refuses a zero vector", async () => {
    sdk.embedContent.mockResolvedValue({ embeddings: [{ values: vector(0) }] });
    await expect(embedTexts(["a"])).rejects.toThrow(/zero vector/);
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

/** A 429 the way the SDK throws it: ApiError, status 429, body as message. */
function rateLimited(retryDelay?: string): Error {
  const details: unknown[] = [
    {
      "@type": "type.googleapis.com/google.rpc.QuotaFailure",
      violations: [
        {
          quotaId: "EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier",
        },
      ],
    },
  ];
  if (retryDelay) {
    details.push({
      "@type": "type.googleapis.com/google.rpc.RetryInfo",
      retryDelay,
    });
  }
  const err = new Error(
    JSON.stringify({
      error: { code: 429, status: "RESOURCE_EXHAUSTED", details },
    }),
  );
  return Object.assign(err, { name: "ApiError", status: 429 });
}

/** One vector per text, for any request. */
const answer = ({ contents }: EmbedArgs) =>
  Promise.resolve({ embeddings: contents.map(() => ({ values: vector(1) })) });

describe("token-aware batching", () => {
  const { batchTexts, estimateTokens, EMBED_BATCH_TOKENS } = embedModule;

  it("estimates tokens as chars / 4, rounded up", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("keeps every request at or under 20,000 estimated tokens", async () => {
    echoVectors();
    // 120 chunks of about 800 tokens (3,200 chars), like a 90-page PDF.
    const texts = Array.from({ length: 120 }, (_, i) =>
      `${i}`.padEnd(3_200, "x"),
    );
    const vectors = await embedTexts(texts);
    expect(EMBED_BATCH_TOKENS).toBe(20_000);
    for (const call of calls()) {
      const tokens = call.contents.reduce((n, t) => n + estimateTokens(t), 0);
      expect(tokens).toBeLessThanOrEqual(EMBED_BATCH_TOKENS);
      expect(call.contents.length).toBeLessThanOrEqual(EMBED_BATCH_SIZE);
    }
    // 25 chunks of 800 = 20,000 tokens per request.
    expect(calls().map((c) => c.contents.length)).toEqual([25, 25, 25, 25, 20]);
    // Order is kept across batches.
    expect(vectors.map((v) => Math.round(v[0] / v[1]))).toEqual(
      texts.map((_, i) => i + 1),
    );
  });

  it("still caps a batch at 100 short texts", () => {
    const sizes = batchTexts(Array.from({ length: 230 }, () => "hi")).map(
      (b) => b.length,
    );
    expect(sizes).toEqual([100, 100, 30]);
  });

  it("sends a text over the token limit alone", () => {
    const big = "x".repeat(4 * 25_000);
    expect(batchTexts(["a", big, "b"])).toEqual([["a"], [big], ["b"]]);
  });
});

describe("rate limits (429)", () => {
  const {
    DOCUMENT_EMBED_DEADLINE_MS,
    QUERY_EMBED_DEADLINE_MS,
    RATE_LIMIT_FALLBACK_MS,
    EmbedRateLimitError,
    retryDelayMs,
  } = embedModule;

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reads Google's retryDelay", () => {
    expect(retryDelayMs(rateLimited("37s"))).toBe(37_000);
    expect(retryDelayMs(rateLimited("1.5s"))).toBe(1_500);
    expect(retryDelayMs(rateLimited())).toBeNull();
    expect(retryDelayMs("nope")).toBeNull();
  });

  it("waits retryDelay, then retries the same batch", async () => {
    sdk.embedContent
      .mockRejectedValueOnce(rateLimited("37s"))
      .mockImplementation(answer);
    const done = embedTexts(["a", "b"]);
    await vi.advanceTimersByTimeAsync(36_999);
    expect(sdk.embedContent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toHaveLength(2);
    expect(calls().map((c) => c.contents)).toEqual([
      ["a", "b"],
      ["a", "b"],
    ]);
  });

  it("waits 60 s when the 429 names no retryDelay", async () => {
    sdk.embedContent
      .mockRejectedValueOnce(rateLimited())
      .mockImplementation(answer);
    const done = embedTexts(["a"]);
    await vi.advanceTimersByTimeAsync(RATE_LIMIT_FALLBACK_MS - 1);
    expect(sdk.embedContent).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await done).toHaveLength(1);
    expect(RATE_LIMIT_FALLBACK_MS).toBe(60_000);
  });

  it("keeps the batches already done and retries only the limited one", async () => {
    const texts = Array.from({ length: 30 }, () => "x".repeat(3_200));
    sdk.embedContent
      .mockImplementationOnce(answer)
      .mockRejectedValueOnce(rateLimited("20s"))
      .mockImplementation(answer);
    const done = embedTexts(texts);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await done).toHaveLength(30);
    expect(calls().map((c) => c.contents.length)).toEqual([25, 5, 5]);
  });

  it("gives up with a clear error once the deadline would pass", async () => {
    expect(DOCUMENT_EMBED_DEADLINE_MS).toBe(270_000);
    sdk.embedContent.mockRejectedValue(rateLimited("60s"));
    const done = embedDocuments(["a"]);
    const settled = expect(done).rejects.toThrow(EmbedRateLimitError);
    // Retries at 60, 120, 180 and 240 s; the next would be at 300 s.
    await vi.advanceTimersByTimeAsync(240_000);
    await settled;
    await expect(done).rejects.toThrow(
      /rate limited \(429\); the next retry, in 60 s, would pass the 270 s deadline/,
    );
    expect(sdk.embedContent).toHaveBeenCalledTimes(5);
  });

  it("takes a custom deadline", async () => {
    sdk.embedContent.mockRejectedValue(rateLimited("10s"));
    const done = embedDocuments(["a"], { deadlineMs: 15_000 });
    const settled = expect(done).rejects.toThrow(/15 s deadline/);
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
    expect(sdk.embedContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    sdk.embedContent.mockRejectedValue(
      Object.assign(new Error("bad request"), { status: 400 }),
    );
    await expect(embedTexts(["a"])).rejects.toThrow("bad request");
    expect(sdk.embedContent).toHaveBeenCalledTimes(1);
  });

  describe("embedQuery (a visitor is waiting)", () => {
    it("retries once when retryDelay fits in 5 s", async () => {
      expect(QUERY_EMBED_DEADLINE_MS).toBe(5_000);
      sdk.embedContent
        .mockRejectedValueOnce(rateLimited("2s"))
        .mockImplementation(answer);
      const done = embedQuery("Q?");
      await vi.advanceTimersByTimeAsync(2_000);
      expect(await done).toHaveLength(1536);
      expect(sdk.embedContent).toHaveBeenCalledTimes(2);
    });

    it("fails at once when retryDelay doesn't fit", async () => {
      sdk.embedContent.mockRejectedValue(rateLimited("37s"));
      await expect(embedQuery("Q?")).rejects.toThrow(EmbedRateLimitError);
      expect(sdk.embedContent).toHaveBeenCalledTimes(1);
    });

    it("never waits the 60 s fallback", async () => {
      sdk.embedContent.mockRejectedValue(rateLimited());
      await expect(embedQuery("Q?")).rejects.toThrow(/5 s deadline/);
      expect(sdk.embedContent).toHaveBeenCalledTimes(1);
    });

    it("gives up within 5 s across retries", async () => {
      sdk.embedContent.mockRejectedValue(rateLimited("2s"));
      const done = embedQuery("Q?");
      const settled = expect(done).rejects.toThrow(EmbedRateLimitError);
      await vi.advanceTimersByTimeAsync(4_000);
      await settled;
      // 0 s, 2 s, 4 s; the next (6 s) would pass 5 s.
      expect(sdk.embedContent).toHaveBeenCalledTimes(3);
    });
  });
});
