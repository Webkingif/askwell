// The bot's answer to one visitor message: POST /api/widget/chat on the
// panel's own origin (project.md §6.6, §8 Public). Errors become a friendly
// notice for the panel; the reply is returned as plain text (§9 XSS: the
// panel renders it as a text node).
import {
  apiErrorSchema,
  MAX_MESSAGE_LENGTH,
  type ApiErrorCode,
  type WidgetChatRequest,
  type WidgetChatResponse,
} from "@askwell/shared";
import { z } from "zod";

export const CHAT_PATH = "/api/widget/chat";
/** Give up on a hung request; the visitor can try again. */
export const CHAT_TIMEOUT_MS = 30_000;

export const NOTICES = {
  rate_limited: "You're sending messages fast. Try again in a minute.",
  quota_exceeded: "This assistant has reached its message limit.",
  message_blocked: "I can't help with that.",
  too_long: `That message is too long. Keep it under ${MAX_MESSAGE_LENGTH.toLocaleString("en-US")} characters.`,
  failed: "Something went wrong. Try again.",
} as const;

export type ReplyFailure = {
  /** Friendly text for the panel, shown as a bot-style notice. */
  notice: string;
  /** Whether sending the same message again can help. */
  retry: boolean;
  /** The conversation is unknown to the server (404): start a new one. */
  resetConversation: boolean;
};

/** Thrown by getReply; carries what the panel shows. */
export class ReplyError extends Error {
  constructor(readonly failure: ReplyFailure) {
    super(failure.notice);
    this.name = "ReplyError";
  }
}

export type GetReply = (
  request: WidgetChatRequest,
) => Promise<WidgetChatResponse>;

const responseSchema = z.object({
  conversationId: z.string().min(1),
  reply: z.string(),
}) satisfies z.ZodType<WidgetChatResponse>;

const FAILED: ReplyFailure = {
  notice: NOTICES.failed,
  retry: true,
  resetConversation: false,
};

/** The friendly failure for an error response. */
export function failureFor(
  status: number,
  code: ApiErrorCode | undefined,
): ReplyFailure {
  if (code === "rate_limited" || (status === 429 && code === undefined)) {
    return {
      notice: NOTICES.rate_limited,
      retry: true,
      resetConversation: false,
    };
  }
  if (code === "quota_exceeded") {
    return {
      notice: NOTICES.quota_exceeded,
      retry: false,
      resetConversation: false,
    };
  }
  if (code === "message_blocked") {
    return {
      notice: NOTICES.message_blocked,
      retry: false,
      resetConversation: false,
    };
  }
  if (status === 400) {
    return { notice: NOTICES.too_long, retry: false, resetConversation: false };
  }
  // 404: an unknown key, or a conversation the server no longer has.
  if (status === 404) return { ...FAILED, resetConversation: true };
  return FAILED;
}

export function createGetReply(
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): GetReply {
  return async (request) => {
    let res: Response;
    try {
      res = await fetchImpl(CHAT_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
      });
    } catch {
      // Offline, DNS, timeout: never the visitor's fault.
      throw new ReplyError(FAILED);
    }

    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const error = apiErrorSchema.safeParse(body);
      throw new ReplyError(
        failureFor(
          res.status,
          error.success ? error.data.error.code : undefined,
        ),
      );
    }
    const parsed = responseSchema.safeParse(body);
    if (!parsed.success) throw new ReplyError(FAILED);
    return parsed.data;
  };
}

export const getReply: GetReply = createGetReply();
