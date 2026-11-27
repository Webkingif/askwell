import Link from "next/link";
import type { ConversationSummary } from "@askwell/shared";
import { projectTabPath } from "../dashboard/nav";
import { EmptyState, GlassPanel } from "../ui";
import { RefreshButton } from "./RefreshButton";
import { formatMessageCount, formatRelative, formatTimestamp } from "./format";

export const conversationPath = (projectId: string, conversationId: string) =>
  `${projectTabPath(projectId, "conversations")}/${encodeURIComponent(conversationId)}`;

/**
 * The Conversations list, newest first (project.md §6.7). Previews are visitor
 * text: rendered as text only, and `ph-no-capture` keeps them out of PostHog
 * session replay.
 */
export function ConversationList({
  projectId,
  conversations,
  limit,
  now,
}: {
  projectId: string;
  conversations: ConversationSummary[];
  /** The list's page size: at this many rows, say only the newest are shown. */
  limit: number;
  now: Date;
}) {
  const header = (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold text-fg">Conversations</h2>
      <RefreshButton />
    </div>
  );

  if (conversations.length === 0) {
    return (
      <GlassPanel padding="lg" className="flex flex-col gap-2">
        {header}
        <EmptyState
          title="No conversations yet"
          message="No conversations yet. Install the widget to start."
          action={
            <Link
              href={projectTabPath(projectId, "install")}
              className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
            >
              Install the widget
            </Link>
          }
        />
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <GlassPanel padding="sm" className="px-4 sm:px-6">
        {header}
      </GlassPanel>
      <GlassPanel padding="none">
        <ul aria-label="Conversations" className="divide-y divide-line">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={conversationPath(projectId, c.id)}
                className="focus-ring flex flex-col gap-1 px-4 py-4 hover:bg-subtle sm:px-6"
              >
                <p
                  className={`ph-no-capture line-clamp-2 text-sm break-words whitespace-pre-wrap ${c.preview ? "text-fg" : "text-muted italic"}`}
                >
                  {c.preview || "No visitor message"}
                </p>
                <p className="text-xs text-muted">
                  {formatMessageCount(c.messageCount)} ·{" "}
                  <time
                    dateTime={c.lastMessageAt}
                    title={formatTimestamp(c.lastMessageAt)}
                  >
                    {formatRelative(c.lastMessageAt, now)}
                  </time>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </GlassPanel>
      {conversations.length >= limit && (
        <p className="px-1 text-xs text-muted">
          Showing the {limit} most recent conversations.
        </p>
      )}
    </div>
  );
}
