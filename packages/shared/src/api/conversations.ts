// Owner routes: reading conversations (project.md §6.7, §8).
import type { MessageRole } from "../enums";
import type { IsoDateString } from "./common";

export interface ConversationSummary {
  id: string;
  visitorId: string;
  /** Start of the first visitor message, shown as plain text. */
  preview: string;
  messageCount: number;
  createdAt: IsoDateString;
  lastMessageAt: IsoDateString;
}

/** GET /api/projects/:id/conversations. Params: `idParamsSchema`. Newest first. */
export interface ListConversationsResponse {
  conversations: ConversationSummary[];
}

export interface Message {
  id: string;
  role: MessageRole;
  /** Render as text, never HTML. */
  body: string;
  createdAt: IsoDateString;
}

/** GET /api/conversations/:id. Params: `idParamsSchema`. */
export interface ConversationThreadResponse {
  conversation: {
    id: string;
    projectId: string;
    visitorId: string;
    createdAt: IsoDateString;
  };
  /** Oldest first. */
  messages: Message[];
}
