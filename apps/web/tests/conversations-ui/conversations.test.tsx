import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type {
  ConversationSummary,
  ConversationThreadResponse,
} from "@askwell/shared";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const nav = vi.hoisted(() => ({
  refresh: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: nav.refresh }),
  notFound: nav.notFound,
}));

const PROJECT = "aaaaaaaa-0000-4000-8000-000000000001";
const OTHER_PROJECT = "aaaaaaaa-0000-4000-8000-000000000002";
const CONV = "cccccccc-0000-4000-8000-000000000001";
const HOSTILE = "<img src=x onerror=alert(1)>";

const db = vi.hoisted(() => ({
  list: [] as ConversationSummary[],
  thread: null as ConversationThreadResponse | null,
  fail: false,
}));
vi.mock("../../lib/conversations", async () => {
  const { ProjectApiError } = await import("../../lib/projects");
  return {
    CONVERSATIONS_LIMIT: 50,
    listConversations: async (projectId: string) => {
      if (db.fail) throw new Error("conversations: list failed (PGRST301)");
      if (projectId !== PROJECT) {
        throw new ProjectApiError("not_found", "Project not found.");
      }
      return db.list;
    },
    getThread: async (id: string) => {
      if (!db.thread || id !== db.thread.conversation.id) {
        throw new ProjectApiError("not_found", "Conversation not found.");
      }
      return db.thread;
    },
  };
});
vi.mock("../../lib/projects", async () => {
  class ProjectApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { ProjectApiError };
});

const { default: ListPage } =
  await import("../../app/dashboard/projects/[projectId]/conversations/page");
const { default: ThreadPage } =
  await import("../../app/dashboard/projects/[projectId]/conversations/[conversationId]/page");
const { default: Loading } =
  await import("../../app/dashboard/projects/[projectId]/conversations/loading");
const { default: ErrorPage } =
  await import("../../app/dashboard/projects/[projectId]/conversations/error");
const { default: NotFound } =
  await import("../../app/dashboard/projects/[projectId]/conversations/not-found");
const { ConversationList, formatRelative } =
  await import("../../components/conversations");

const NOW = new Date("2026-11-27T15:00:00Z");

const summary = (n: number, extra: Partial<ConversationSummary> = {}) => ({
  id: `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`,
  visitorId: `visitor-${n}`,
  preview: `Question ${n}`,
  messageCount: 2,
  createdAt: "2026-11-27T14:00:00Z",
  lastMessageAt: "2026-11-27T14:55:00Z",
  ...extra,
});

async function render(node: React.ReactNode): Promise<string> {
  const stream = await renderToReadableStream(node);
  await stream.allReady;
  return new Response(stream).text();
}

/** Visible text, without tags or React's text separators. */
const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const listPage = (projectId = PROJECT) =>
  render(
    <ListPage
      params={Promise.resolve({ projectId })}
      searchParams={Promise.resolve({})}
    />,
  );
const threadPage = (projectId = PROJECT, conversationId = CONV) =>
  render(
    <ThreadPage
      params={Promise.resolve({ projectId, conversationId })}
      searchParams={Promise.resolve({})}
    />,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  db.list = [];
  db.thread = null;
  db.fail = false;
  nav.notFound.mockClear();
});

describe("Conversations list", () => {
  it("lists newest first with preview, count, relative time and a thread link", async () => {
    db.list = [
      summary(2, { preview: "Do you ship to Canada?", messageCount: 4 }),
      summary(1, { lastMessageAt: "2026-11-26T10:00:00Z", messageCount: 1 }),
    ];
    const html = await listPage();
    const t = text(html);
    expect(t.indexOf("Do you ship to Canada?")).toBeLessThan(
      t.indexOf("Question 1"),
    );
    expect(t).toContain("4 messages · 5 minutes ago");
    expect(t).toContain("1 message · yesterday");
    expect(html).toContain(
      `href="/dashboard/projects/${PROJECT}/conversations/${summary(2).id}"`,
    );
    expect(html).toContain('dateTime="2026-11-27T14:55:00Z"');
    expect(t).toContain("Refresh");
    expect(t).not.toContain("most recent conversations");
    expect(t).not.toContain("No usage yet");
  });

  it("marks every preview ph-no-capture and renders HTML in it as text", async () => {
    db.list = [summary(1, { preview: HOSTILE }), summary(2)];
    const html = await listPage();
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    const previews = html.match(/<p class="[^"]*line-clamp-2[^"]*"/g) ?? [];
    expect(previews).toHaveLength(2);
    for (const p of previews) expect(p).toContain("ph-no-capture");
  });

  it("notes the cap at 50 conversations", async () => {
    db.list = Array.from({ length: 50 }, (_, i) => summary(i + 1));
    expect(text(await listPage())).toContain(
      "Showing the 50 most recent conversations.",
    );
  });

  it("shows the empty state with an Install link and Refresh", async () => {
    const html = await listPage();
    const t = text(html);
    expect(t).toContain("No conversations yet. Install the widget to start.");
    expect(html).toContain(`href="/dashboard/projects/${PROJECT}/install"`);
    expect(t).toContain("Refresh");
  });

  it("shows project not found for another owner's project and a bad id", async () => {
    for (const id of [OTHER_PROJECT, "nope"]) {
      const t = text(await listPage(id));
      expect(t).toContain("Project not found");
      expect(t).not.toContain("Refresh");
    }
  });

  it("lets other errors reach error.tsx", async () => {
    db.fail = true;
    await expect(
      ListPage({
        params: Promise.resolve({ projectId: PROJECT }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("conversations: list failed");
  });

  it("labels a conversation with no visitor message", () => {
    const html = renderToStaticMarkup(
      <ConversationList
        projectId={PROJECT}
        conversations={[summary(1, { preview: "", messageCount: 0 })]}
        limit={50}
        now={NOW}
      />,
    );
    expect(text(html)).toContain("No visitor message");
    expect(text(html)).toContain("0 messages");
  });
});

describe("Conversation thread", () => {
  const thread = (projectId = PROJECT): ConversationThreadResponse => ({
    conversation: {
      id: CONV,
      projectId,
      visitorId: "visitor-1",
      createdAt: "2026-11-27T14:00:00Z",
    },
    messages: [
      {
        id: "m1",
        role: "visitor",
        body: `${HOSTILE}\nSecond line`,
        createdAt: "2026-11-27T14:00:01Z",
      },
      {
        id: "m2",
        role: "bot",
        body: "**Not markdown** <b>nor HTML</b>",
        createdAt: "2026-11-27T14:00:03Z",
      },
    ],
  });

  it("shows visitor and bot messages, oldest first, with timestamps and a back link", async () => {
    db.thread = thread();
    const html = await threadPage();
    const t = text(html);
    expect(t.indexOf("Visitor")).toBeLessThan(t.indexOf("Bot ·"));
    expect(t).toContain("Visitor · Nov 27, 2026, 2:00 PM UTC");
    expect(html).toMatch(/data-role="visitor"/);
    expect(html).toMatch(/data-role="bot"/);
    expect(html).toContain(
      `href="/dashboard/projects/${PROJECT}/conversations"`,
    );
    expect(t).toContain("All conversations");
    expect(t).toContain("Refresh");
  });

  it("renders hostile bodies as literal text, keeps line breaks, and marks them ph-no-capture", async () => {
    db.thread = thread();
    const html = await threadPage();
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>");
    expect(html).not.toContain("<strong>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;\nSecond line");
    expect(html).toContain("**Not markdown** &lt;b&gt;nor HTML&lt;/b&gt;");
    const bodies =
      html.match(/<p class="[^"]*whitespace-pre-wrap[^"]*"/g) ?? [];
    expect(bodies).toHaveLength(2);
    for (const b of bodies) expect(b).toContain("ph-no-capture");
  });

  it("calls notFound() for a missing or hidden conversation", async () => {
    await expect(threadPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(nav.notFound).toHaveBeenCalled();
  });

  it("calls notFound() when the conversation belongs to another project", async () => {
    db.thread = thread(OTHER_PROJECT);
    await expect(threadPage(PROJECT)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound() for bad ids", async () => {
    db.thread = thread();
    await expect(threadPage(PROJECT, "nope")).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(threadPage("nope", CONV)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("shows an empty thread", async () => {
    db.thread = { ...thread(), messages: [] };
    expect(text(await threadPage())).toContain(
      "No messages in this conversation",
    );
  });
});

describe("states and helpers", () => {
  it("loading, error and not-found render", () => {
    expect(text(renderToStaticMarkup(<Loading />))).toContain(
      "Loading conversations",
    );
    const err = renderToStaticMarkup(
      <ErrorPage error={new Error("secret detail")} retry={() => {}} />,
    );
    expect(text(err)).toContain("We couldn't load your conversations");
    expect(err).not.toContain("secret detail");
    expect(text(renderToStaticMarkup(<NotFound />))).toContain(
      "Conversation not found",
    );
  });

  it("formatRelative", () => {
    expect(formatRelative("2026-11-27T14:59:30Z", NOW)).toBe("just now");
    expect(formatRelative("2026-11-27T12:00:00Z", NOW)).toBe("3 hours ago");
    expect(formatRelative("2026-11-13T15:00:00Z", NOW)).toBe("2 weeks ago");
    expect(formatRelative("2025-11-01T00:00:00Z", NOW)).toBe("last year");
  });
});
