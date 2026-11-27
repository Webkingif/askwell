// The panel's chat state, as a pure reducer so it can be tested without a DOM.
import { MAX_MESSAGE_LENGTH, type MessageRole } from "@askwell/shared";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  /** Shown as text, never HTML. */
  text: string;
}

/** A bot-style notice for the last send, when it failed. */
export interface ChatNotice {
  /** Friendly text, shown as text. */
  text: string;
  /** The message to send again, when retrying can help. */
  retryText: string | null;
}

export interface ChatState {
  messages: ChatMessage[];
  /** Waiting for the bot: shows the typing state and blocks sending. */
  typing: boolean;
  conversationId?: string;
  /** Why the last send failed, if it did. */
  notice: ChatNotice | null;
}

export type ChatAction =
  | { type: "sent"; id: string; text: string }
  | { type: "replied"; id: string; text: string; conversationId: string }
  | {
      type: "failed";
      notice: string;
      retry: boolean;
      /** The server doesn't know the conversation: start a new one. */
      resetConversation?: boolean;
    }
  /** Sends the failed message again, without adding a new bubble. */
  | { type: "retried" };

export const initialChatState: ChatState = {
  messages: [],
  typing: false,
  notice: null,
};

/** The text to send, or null if it's empty or too long. */
export function cleanMessage(raw: string): string | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > MAX_MESSAGE_LENGTH) return null;
  return text;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "sent":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.id, role: "visitor", text: action.text },
        ],
        typing: true,
        notice: null,
      };
    case "replied":
      return {
        ...state,
        messages: [
          ...state.messages,
          { id: action.id, role: "bot", text: action.text },
        ],
        typing: false,
        conversationId: action.conversationId,
      };
    case "failed": {
      const last = state.messages.at(-1);
      return {
        ...state,
        typing: false,
        conversationId: action.resetConversation
          ? undefined
          : state.conversationId,
        notice: {
          text: action.notice,
          retryText:
            action.retry && last?.role === "visitor" ? last.text : null,
        },
      };
    }
    case "retried":
      return { ...state, typing: true, notice: null };
  }
}
