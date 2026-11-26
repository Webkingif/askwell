"use client";

// The chat panel inside the widget iframe (project.md §6.5 Panel).
// Every message renders as a text node: no HTML, no markdown (§9 XSS).
import {
  APP_NAME,
  MAX_MESSAGE_LENGTH,
  type WidgetConfig,
} from "@askwell/shared";
import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { cx } from "../ui";
import {
  SEND_ERROR,
  chatReducer,
  cleanMessage,
  initialChatState,
  type ChatMessage,
  type ChatState,
} from "./chat-state";
import { getReply as defaultGetReply, type GetReply } from "./get-reply";
import { connectToParent, type ParentLink } from "./parent-link";
import { browserStorage, getVisitorId } from "./visitor";

export interface ChatPanelProps {
  config: WidgetConfig;
  publicKey: string;
  /** Tests and previews only. */
  initialState?: ChatState;
  getReply?: GetReply;
}

export function ChatPanel({
  config,
  publicKey,
  initialState = initialChatState,
  getReply = defaultGetReply,
}: ChatPanelProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const [draft, setDraft] = useState("");
  const [connected, setConnected] = useState(false);
  const linkRef = useRef<ParentLink | null>(null);
  const visitorIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // True after the visitor closed us with our own button, until the loader
  // says we're open again. Replies that land meanwhile count as unread.
  const hiddenRef = useRef(false);
  const unreadRef = useRef(0);

  useEffect(() => {
    visitorIdRef.current = getVisitorId(browserStorage());
    const link = connectToParent(window, (msg) => {
      if (msg.type === "askwell:opened") {
        setConnected(true);
        hiddenRef.current = false;
        if (unreadRef.current > 0) {
          unreadRef.current = 0;
          link.send({ type: "askwell:unread", count: 0 });
        }
        inputRef.current?.focus({ preventScroll: true });
      }
    });
    linkRef.current = link;
    return () => link.stop();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages.length, state.typing]);

  const close = () => {
    if (linkRef.current?.send({ type: "askwell:close" })) {
      hiddenRef.current = true;
    }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const text = cleanMessage(draft);
    if (!text || state.typing) return;
    setDraft("");
    dispatch({ type: "sent", id: crypto.randomUUID(), text });
    visitorIdRef.current ??= getVisitorId(browserStorage());
    try {
      const res = await getReply({
        key: publicKey,
        visitorId: visitorIdRef.current,
        conversationId: state.conversationId,
        message: text,
      });
      dispatch({
        type: "replied",
        id: crypto.randomUUID(),
        text: res.reply,
        conversationId: res.conversationId,
      });
      if (hiddenRef.current) {
        unreadRef.current += 1;
        linkRef.current?.send({
          type: "askwell:unread",
          count: unreadRef.current,
        });
      }
    } catch {
      dispatch({ type: "failed", error: SEND_ERROR });
    }
  };

  const canSend = cleanMessage(draft) !== null && !state.typing;
  const nearLimit = draft.length > MAX_MESSAGE_LENGTH * 0.9;

  return (
    <div className="surface-light flex h-dvh min-h-0 w-full flex-col bg-bg text-fg">
      <header className="glass flex h-14 shrink-0 items-center gap-2 rounded-none border-x-0 border-t-0 px-4">
        <h1 className="min-w-0 flex-1 truncate text-base font-semibold">
          {config.headerText}
        </h1>
        {connected && (
          <button
            type="button"
            onClick={close}
            aria-label="Close chat"
            className="focus-ring -mr-2 inline-flex size-9 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg"
          >
            <CloseIcon />
          </button>
        )}
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        role="log"
        aria-live="polite"
        aria-label="Messages"
      >
        {state.messages.length === 0 && !state.typing ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-medium text-fg">Hi! How can we help?</p>
            <p className="text-xs text-muted">
              Ask a question and we&apos;ll answer right here.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {state.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {state.typing && <TypingBubble />}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="shrink-0 border-t border-line bg-bg px-3 pt-3 pb-2"
      >
        {state.error && (
          <p role="alert" className="mb-2 px-1 text-xs font-medium text-fg">
            {state.error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <label htmlFor="embed-message" className="sr-only">
            Message
          </label>
          <input
            ref={inputRef}
            id="embed-message"
            name="message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Type your message"
            autoComplete="off"
            aria-describedby={nearLimit ? "embed-count" : undefined}
            className="focus-ring h-11 min-w-0 flex-1 rounded-full border border-line bg-glass px-4 text-base text-fg placeholder:text-muted hover:border-muted sm:text-sm"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            className="focus-ring inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <SendIcon />
          </button>
        </div>
        <div className="mt-1.5 flex min-h-4 items-center justify-between gap-2 px-1 text-[11px] text-muted">
          <span id="embed-count" aria-live="polite">
            {nearLimit ? `${draft.length}/${MAX_MESSAGE_LENGTH}` : ""}
          </span>
          {config.showBadge && (
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring rounded-sm hover:text-fg"
              data-testid="powered-by"
            >
              Powered by <span className="font-semibold">{APP_NAME}</span>
            </a>
          )}
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "visitor";
  return (
    <li
      className={cx(
        "flex animate-fade-in",
        mine ? "justify-end" : "justify-start",
      )}
    >
      <p
        className={cx(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
          mine
            ? "rounded-br-sm bg-accent text-accent-fg"
            : "glass rounded-bl-sm",
        )}
      >
        <span className="sr-only">{mine ? "You: " : "Bot: "}</span>
        {message.text}
      </p>
    </li>
  );
}

function TypingBubble() {
  return (
    <li className="flex justify-start" role="status">
      <span className="glass inline-flex items-center gap-1 rounded-lg rounded-bl-sm px-3 py-3">
        <span className="sr-only">Typing…</span>
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            aria-hidden="true"
            className="size-1.5 animate-pulse-soft rounded-full bg-muted"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </span>
    </li>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Shown when the key is invalid or unknown, or the config can't load. */
export function EmbedUnavailable() {
  return (
    <div className="surface-light flex h-dvh w-full flex-col items-center justify-center gap-1 bg-bg px-6 text-center text-fg">
      <h1 className="text-base font-semibold">
        This chat isn&apos;t available
      </h1>
      <p className="text-sm text-muted">Please try again later.</p>
    </div>
  );
}
