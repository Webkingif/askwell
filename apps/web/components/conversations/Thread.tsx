import Link from "next/link";
import type { ConversationThreadResponse } from "@askwell/shared";
import { projectTabPath } from "../dashboard/nav";
import { EmptyState, GlassPanel, cx } from "../ui";
import { RefreshButton } from "./RefreshButton";
import { formatTimestamp } from "./format";

/**
 * One conversation, oldest first. Message bodies are text, never HTML
 * (project.md §9 XSS): plain React text with line breaks kept, and
 * `ph-no-capture` so PostHog session replay never records them.
 */
export function Thread({
  projectId,
  thread,
}: {
  projectId: string;
  thread: ConversationThreadResponse;
}) {
  const { conversation, messages } = thread;
  return (
    <div className="flex flex-col gap-3">
      <GlassPanel padding="sm" className="px-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={projectTabPath(projectId, "conversations")}
            className="focus-ring rounded-sm text-sm font-medium text-fg hover:underline"
          >
            ← All conversations
          </Link>
          <RefreshButton />
        </div>
        <p className="mt-1 text-xs text-muted">
          Started{" "}
          <time dateTime={conversation.createdAt}>
            {formatTimestamp(conversation.createdAt)}
          </time>
        </p>
      </GlassPanel>

      <GlassPanel padding="md">
        {messages.length === 0 ? (
          <EmptyState title="No messages in this conversation" />
        ) : (
          <ol aria-label="Messages" className="flex flex-col gap-4">
            {messages.map((m) => {
              const visitor = m.role === "visitor";
              return (
                <li
                  key={m.id}
                  className={cx(
                    "flex flex-col gap-1",
                    visitor ? "items-start" : "items-end",
                  )}
                  data-role={m.role}
                >
                  <p className="text-xs text-muted">
                    <span className="font-medium text-fg">
                      {visitor ? "Visitor" : "Bot"}
                    </span>{" "}
                    ·{" "}
                    <time dateTime={m.createdAt}>
                      {formatTimestamp(m.createdAt)}
                    </time>
                  </p>
                  <p
                    className={cx(
                      "ph-no-capture max-w-[85%] rounded-lg px-4 py-2 text-sm break-words whitespace-pre-wrap sm:max-w-[75%]",
                      visitor
                        ? "glass text-fg"
                        : "bg-accent text-accent-fg shadow-sm",
                    )}
                  >
                    {m.body}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </GlassPanel>
    </div>
  );
}
