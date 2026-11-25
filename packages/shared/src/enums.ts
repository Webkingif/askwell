// Enum values, as const arrays (for zod and loops) plus their union types.
// They match the database columns in project.md §7. No zod here: the widget
// bundle imports these, and zod schemas live in schemas.ts.

export const KNOWLEDGE_SOURCE_TYPES = ["text", "pdf", "md", "txt"] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPES)[number];

/** The file types an owner may upload (every source type except pasted text). */
export const KNOWLEDGE_FILE_TYPES = ["pdf", "md", "txt"] as const;
export type KnowledgeFileType = (typeof KNOWLEDGE_FILE_TYPES)[number];

/** MIME types accepted for each file type. The Storage bucket allows the same list. */
export const KNOWLEDGE_FILE_MIME_TYPES = {
  pdf: ["application/pdf"],
  md: ["text/markdown", "text/x-markdown"],
  txt: ["text/plain"],
} as const satisfies Record<KnowledgeFileType, readonly string[]>;

export const ALLOWED_KNOWLEDGE_MIME_TYPES = [
  ...KNOWLEDGE_FILE_MIME_TYPES.pdf,
  ...KNOWLEDGE_FILE_MIME_TYPES.md,
  ...KNOWLEDGE_FILE_MIME_TYPES.txt,
] as const;
export type KnowledgeMimeType = (typeof ALLOWED_KNOWLEDGE_MIME_TYPES)[number];

export const KNOWLEDGE_SOURCE_STATUSES = [
  "uploading",
  "processing",
  "ready",
  "failed",
] as const;
export type KnowledgeSourceStatus = (typeof KNOWLEDGE_SOURCE_STATUSES)[number];

export const MESSAGE_ROLES = ["visitor", "bot"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

export const WIDGET_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

export const WIDGET_ANIMATIONS = ["fade", "slide", "scale"] as const;
export type WidgetAnimation = (typeof WIDGET_ANIMATIONS)[number];
