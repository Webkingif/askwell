// Every error response: `{ error: { code, message } }` with the matching HTTP status.
import { z } from "zod";

export const API_ERROR_STATUS = {
  /** Input failed its zod schema. */
  invalid_request: 400,
  /** No Clerk session (owner routes). */
  unauthorized: 401,
  /** Pro feature on the Free plan (e.g. saving widget config). */
  plan_required: 402,
  /** Plan count limit reached (projects, knowledge sources). */
  plan_limit_reached: 402,
  /** Signed in, but not allowed to touch this resource. */
  forbidden: 403,
  /** Message stopped by prompt-injection detection. */
  message_blocked: 403,
  /** Unknown id or public key, or not the caller's. */
  not_found: 404,
  /** State conflict, e.g. a source already finalized. */
  conflict: 409,
  /** Knowledge file over MAX_KNOWLEDGE_FILE_BYTES. */
  file_too_large: 413,
  /** Knowledge file not PDF, Markdown or TXT, or not what it claims to be. */
  unsupported_file_type: 415,
  /** Too many requests (Arcjet rate limit). */
  rate_limited: 429,
  /** Monthly message quota used up. */
  quota_exceeded: 429,
  /** Anything unexpected on our side. */
  internal_error: 500,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export const API_ERROR_CODES = Object.keys(API_ERROR_STATUS) as [
  ApiErrorCode,
  ...ApiErrorCode[],
];

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/** Build an error body. Pair it with `API_ERROR_STATUS[code]`. */
export function apiError(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } };
}
