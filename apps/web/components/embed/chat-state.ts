// The panel's chat state, as a pure reducer so it can be tested without a DOM.
import { MAX_MESSAGE_LENGTH, type MessageRole } from "@askwell/shared";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  /** Shown as text, never HTML. */
  text: string;
}

export interface ChatState {
  messages: ChatMessage[];
  /** Waiting for the bot: shows the typing state and blocks sending. */
  typing: boolean;
  conversationId?: string;
  /** A friendly error for the last send, if it failed. */
  error: string | null;
}

export type ChatAction =
  | { type: "sent"; id: string; text: string }
  | { type: "replied"; id: string; text: string; conversationId: string }
  | { type: "failed"; error: string };

export const initialChatState: ChatState = {
  messages: [],
  typing: false,
  error: null,
};

export const SEND_ERROR = "Your message didn't go through. Try again.";

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
        error: null,
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
    case "failed":
      return { ...state, typing: false, error: action.error };
  }
}
