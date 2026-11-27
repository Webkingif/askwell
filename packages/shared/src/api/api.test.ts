import { describe, expect, expectTypeOf, it } from "vitest";
import {
  type PostHogConfigResponse,
  API_ERROR_STATUS,
  MAX_KNOWLEDGE_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  apiError,
  apiErrorSchema,
  createProjectRequestSchema,
  createTextKnowledgeRequestSchema,
  finalizeKnowledgeRequestSchema,
  idParamsSchema,
  knowledgeFileTypeFromName,
  knowledgeUploadUrlRequestSchema,
  updateProjectRequestSchema,
  updateWidgetConfigRequestSchema,
  widgetChatRequestSchema,
  widgetConfigQuerySchema,
} from "../index";

const KEY = "pk_AbCdEfGh12345678";
const UUID = "3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f";

describe("idParamsSchema (every /:id route)", () => {
  it("accepts a uuid", () => {
    expect(idParamsSchema.safeParse({ id: UUID }).success).toBe(true);
  });
  it("rejects a non-uuid", () => {
    expect(idParamsSchema.safeParse({ id: "123" }).success).toBe(false);
  });
});

describe("GET /api/widget/config", () => {
  it("accepts a valid key", () => {
    expect(widgetConfigQuerySchema.safeParse({ key: KEY }).success).toBe(true);
  });
  it.each(["AbCdEfGh12345678", "pk_short", "pk_has spaces in it!", ""])(
    "rejects the bad key %j",
    (key) => {
      expect(widgetConfigQuerySchema.safeParse({ key }).success).toBe(false);
    },
  );
});

describe("POST /api/widget/chat", () => {
  const valid = { key: KEY, visitorId: UUID, message: "Hello?" };

  it("accepts a first message (no conversationId)", () => {
    expect(widgetChatRequestSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts a follow-up with conversationId", () => {
    const r = widgetChatRequestSchema.safeParse({
      ...valid,
      conversationId: UUID,
    });
    expect(r.success).toBe(true);
  });
  it("accepts exactly MAX_MESSAGE_LENGTH characters", () => {
    const message = "a".repeat(MAX_MESSAGE_LENGTH);
    expect(
      widgetChatRequestSchema.safeParse({ ...valid, message }).success,
    ).toBe(true);
  });
  it("rejects a 1001-character message", () => {
    const message = "a".repeat(1001);
    expect(
      widgetChatRequestSchema.safeParse({ ...valid, message }).success,
    ).toBe(false);
  });
  it("rejects a blank message", () => {
    expect(
      widgetChatRequestSchema.safeParse({ ...valid, message: "   " }).success,
    ).toBe(false);
  });
  it("rejects a bad public key", () => {
    expect(
      widgetChatRequestSchema.safeParse({ ...valid, key: "sk_secret" }).success,
    ).toBe(false);
  });
  it("rejects a bad conversationId", () => {
    expect(
      widgetChatRequestSchema.safeParse({ ...valid, conversationId: "x" })
        .success,
    ).toBe(false);
  });
});

describe("POST /api/projects and PATCH /api/projects/:id", () => {
  it.each([
    ["create", createProjectRequestSchema],
    ["rename", updateProjectRequestSchema],
  ])("%s accepts a name and rejects a blank or long one", (_n, schema) => {
    expect(schema.safeParse({ name: "My site" }).success).toBe(true);
    expect(schema.safeParse({ name: " " }).success).toBe(false);
    expect(schema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge", () => {
  it("accepts a title and text", () => {
    const r = createTextKnowledgeRequestSchema.safeParse({
      title: "FAQ",
      text: "We ship worldwide.",
    });
    expect(r.success).toBe(true);
  });
  it("rejects empty text", () => {
    const r = createTextKnowledgeRequestSchema.safeParse({
      title: "FAQ",
      text: "",
    });
    expect(r.success).toBe(false);
  });
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  const valid = {
    title: "Handbook",
    fileName: "handbook.pdf",
    contentType: "application/pdf",
    sizeBytes: 1024,
  };

  it("accepts a PDF under the limit", () => {
    expect(knowledgeUploadUrlRequestSchema.safeParse(valid).success).toBe(true);
  });
  it("accepts exactly MAX_KNOWLEDGE_FILE_BYTES", () => {
    const r = knowledgeUploadUrlRequestSchema.safeParse({
      ...valid,
      sizeBytes: MAX_KNOWLEDGE_FILE_BYTES,
    });
    expect(r.success).toBe(true);
  });
  it("accepts Markdown and TXT", () => {
    for (const [fileName, contentType] of [
      ["notes.md", "text/markdown"],
      ["notes.TXT", "text/plain"],
    ]) {
      const r = knowledgeUploadUrlRequestSchema.safeParse({
        ...valid,
        fileName,
        contentType,
      });
      expect(r.success).toBe(true);
    }
  });
  it("rejects a file over 10 MB", () => {
    const r = knowledgeUploadUrlRequestSchema.safeParse({
      ...valid,
      sizeBytes: MAX_KNOWLEDGE_FILE_BYTES + 1,
    });
    expect(r.success).toBe(false);
  });
  it("rejects a disallowed type", () => {
    const r = knowledgeUploadUrlRequestSchema.safeParse({
      ...valid,
      fileName: "photo.png",
      contentType: "image/png",
    });
    expect(r.success).toBe(false);
  });
  it("rejects an extension that does not match the content type", () => {
    const r = knowledgeUploadUrlRequestSchema.safeParse({
      ...valid,
      fileName: "handbook.txt",
    });
    expect(r.success).toBe(false);
  });
});

describe("knowledgeFileTypeFromName", () => {
  it("maps allowed extensions and refuses others", () => {
    expect(knowledgeFileTypeFromName("a.PDF")).toBe("pdf");
    expect(knowledgeFileTypeFromName("a.md")).toBe("md");
    expect(knowledgeFileTypeFromName("a.exe")).toBeNull();
    expect(knowledgeFileTypeFromName("noext")).toBeNull();
  });
});

describe("POST /api/projects/:id/knowledge/finalize", () => {
  it("accepts a source id and rejects a bad one", () => {
    expect(
      finalizeKnowledgeRequestSchema.safeParse({ sourceId: UUID }).success,
    ).toBe(true);
    expect(
      finalizeKnowledgeRequestSchema.safeParse({ sourceId: 7 }).success,
    ).toBe(false);
  });
});

describe("PATCH /api/projects/:id/config", () => {
  it("accepts a partial change", () => {
    const r = updateWidgetConfigRequestSchema.safeParse({
      position: "top-left",
    });
    expect(r.success).toBe(true);
  });
  it("rejects an empty body", () => {
    expect(updateWidgetConfigRequestSchema.safeParse({}).success).toBe(false);
  });
  it("rejects a bad value", () => {
    const r = updateWidgetConfigRequestSchema.safeParse({ buttonColor: "#12" });
    expect(r.success).toBe(false);
  });
});

describe("ApiError", () => {
  it("apiError builds a valid body", () => {
    const body = apiError("quota_exceeded", "Monthly limit reached");
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(API_ERROR_STATUS[body.error.code]).toBe(429);
  });
  it("rejects an unknown code", () => {
    const r = apiErrorSchema.safeParse({
      error: { code: "oops", message: "" },
    });
    expect(r.success).toBe(false);
  });
  it("uses 402 for a Free config save", () => {
    expect(API_ERROR_STATUS.plan_required).toBe(402);
  });
});

describe("GET /api/posthog-config", () => {
  it("is a key and host, or both null", () => {
    const configured: PostHogConfigResponse = {
      key: "phc_x",
      host: "https://us.i.posthog.com",
    };
    const off: PostHogConfigResponse = { key: null, host: null };
    expect([configured.key, off.key]).toEqual(["phc_x", null]);
    expectTypeOf<{
      key: string;
      host: null;
    }>().not.toExtend<PostHogConfigResponse>();
    expectTypeOf<{
      key: null;
      host: string;
    }>().not.toExtend<PostHogConfigResponse>();
  });
});
