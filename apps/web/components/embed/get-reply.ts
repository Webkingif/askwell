// The bot's answer to one visitor message. Phase 2 fakes it; Phase 3
// replaces this one function with POST /api/widget/chat (project.md §8).
import type { WidgetChatRequest, WidgetChatResponse } from "@askwell/shared";

export const MOCK_REPLY = "Thanks! Real answers arrive soon.";
/** Fake thinking time, in ms, so the typing state shows. */
export const MOCK_DELAY_MIN = 600;
export const MOCK_DELAY_MAX = 900;

export type GetReply = (
  request: WidgetChatRequest,
) => Promise<WidgetChatResponse>;

export const getReply: GetReply = async (request) => {
  const ms = MOCK_DELAY_MIN + Math.random() * (MOCK_DELAY_MAX - MOCK_DELAY_MIN);
  await new Promise((resolve) => setTimeout(resolve, ms));
  return {
    conversationId: request.conversationId ?? crypto.randomUUID(),
    reply: MOCK_REPLY,
  };
};
