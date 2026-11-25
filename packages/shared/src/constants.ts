// Fixed limits and formats shared by the app, the widget and the database.

/** Largest knowledge file we accept: 10 MB. The Storage bucket enforces the same size. */
export const MAX_KNOWLEDGE_FILE_BYTES = 10 * 1024 * 1024;

/** Longest visitor message, in characters (after trimming). */
export const MAX_MESSAGE_LENGTH = 1000;

/** Every project's public key starts with this. */
export const PUBLIC_KEY_PREFIX = "pk_";

/** `pk_` followed by 16–64 URL-safe random characters. */
export const PUBLIC_KEY_PATTERN = /^pk_[A-Za-z0-9_-]{16,64}$/;

/** Text field limits for owner input. */
export const MAX_PROJECT_NAME_LENGTH = 80;
export const MAX_KNOWLEDGE_TITLE_LENGTH = 200;
/** Pasted knowledge text, in characters. */
export const MAX_KNOWLEDGE_TEXT_LENGTH = 200_000;
export const MAX_FILE_NAME_LENGTH = 255;
export const MAX_WIDGET_LABEL_LENGTH = 40;
export const MAX_WIDGET_HEADER_LENGTH = 60;
