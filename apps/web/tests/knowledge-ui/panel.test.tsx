// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { KnowledgeSource } from "@askwell/shared";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { KnowledgePanel, POLL_MS, POLL_MAX_MS } =
  await import("../../components/knowledge");

const PROJECT = "aaaaaaaa-0000-4000-8000-000000000001";
const SIGNED_URL = "https://storage.test/upload/sign/knowledge/k?token=t";

const fetchMock = vi.fn<typeof fetch>();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

let seq = 0;
function source(over: Partial<KnowledgeSource> = {}): KnowledgeSource {
  seq += 1;
  return {
    id: `bbbbbbbb-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    projectId: PROJECT,
    title: `Source ${seq}`,
    type: "text",
    status: "ready",
    createdAt: "2026-11-27T10:00:00+00:00",
    ...over,
  };
}

function renderPanel(
  sources: KnowledgeSource[],
  { plan = "free", limit = 3 } = {},
) {
  return render(
    <KnowledgePanel
      projectId={PROJECT}
      sources={sources}
      plan={plan as "free" | "pro"}
      limit={limit}
    />,
  );
}

const LIMIT_MESSAGE =
  "The Free plan includes 3 knowledge sources per project. Upgrade to Pro for more.";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("list", () => {
  it("shows the empty state and the count", () => {
    renderPanel([]);
    expect(screen.getByText("Teach your bot about your business")).toBeTruthy();
    expect(screen.getByText("0 of 3 sources")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("lists sources with type, date and status labels; uploading shows as Processing", () => {
    renderPanel(
      [
        source({ title: "FAQ", status: "ready" }),
        source({ title: "Manual", type: "pdf", status: "uploading" }),
        source({ title: "Notes", type: "md", status: "processing" }),
        source({ title: "Broken", type: "txt", status: "failed" }),
      ],
      { plan: "pro", limit: 25 },
    );
    const items = within(
      screen.getByRole("list", { name: "Knowledge sources" }),
    ).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByText("Ready")).toBeTruthy();
    expect(within(items[0]!).getByText(/Text · Added/)).toBeTruthy();
    expect(within(items[0]!).getByText("Nov 27, 2026")).toBeTruthy();
    expect(within(items[1]!).getByText("Processing")).toBeTruthy();
    expect(within(items[1]!).getByText(/PDF · Added/)).toBeTruthy();
    expect(within(items[2]!).getByText("Processing")).toBeTruthy();
    expect(within(items[3]!).getByText("Failed")).toBeTruthy();
    expect(within(items[3]!).getByText(/couldn't read this one/)).toBeTruthy();
    expect(screen.getByText("4 of 25 sources")).toBeTruthy();
  });

  it("renders titles as text, never HTML", () => {
    const { container } = renderPanel([
      source({ title: '<img src=x onerror="alert(1)">' }),
    ]);
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the limit message with a Billing link at the Free limit", () => {
    renderPanel([source(), source(), source()]);
    expect(screen.getByText("3 of 3 sources")).toBeTruthy();
    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain(LIMIT_MESSAGE);
    expect(
      within(notice)
        .getByRole("link", { name: "Upgrade to Pro" })
        .getAttribute("href"),
    ).toBe("/dashboard/billing");
  });

  it("Pro at its limit is told to delete one", () => {
    renderPanel(
      Array.from({ length: 25 }, () => source()),
      { plan: "pro", limit: 25 },
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Delete one to add another",
    );
  });
});

describe("polling", () => {
  it("refreshes every few seconds while a source is processing, and stops when it settles", () => {
    vi.useFakeTimers();
    const s = source({ status: "processing" });
    const { rerender } = renderPanel([s]);
    act(() => vi.advanceTimersByTime(POLL_MS * 2));
    expect(router.refresh).toHaveBeenCalledTimes(2);

    rerender(
      <KnowledgePanel
        projectId={PROJECT}
        sources={[{ ...s, status: "ready" }]}
        plan="free"
        limit={3}
      />,
    );
    act(() => vi.advanceTimersByTime(POLL_MS * 3));
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("does not refresh when nothing is pending", () => {
    vi.useFakeTimers();
    renderPanel([source(), source({ status: "failed" })]);
    act(() => vi.advanceTimersByTime(POLL_MS * 3));
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("gives up after POLL_MAX_MS", () => {
    vi.useFakeTimers();
    renderPanel([source({ status: "uploading" })]);
    act(() => vi.advanceTimersByTime(POLL_MAX_MS + POLL_MS * 5));
    const calls = router.refresh.mock.calls.length;
    act(() => vi.advanceTimersByTime(POLL_MS * 5));
    expect(router.refresh.mock.calls.length).toBe(calls);
    expect(calls).toBeLessThanOrEqual(POLL_MAX_MS / POLL_MS);
  });
});

describe("paste", () => {
  it("posts title and text, then clears and refreshes", async () => {
    const user = userEvent.setup();
    renderPanel([]);
    reply(201, { source: source({ status: "processing" }) });
    await user.type(
      within(screen.getByRole("form", { name: "Paste text" })).getByLabelText(
        "Title",
      ),
      "Hours",
    );
    await user.type(screen.getByLabelText("Text"), "Open at nine.");
    await user.click(screen.getByRole("button", { name: "Add text" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${PROJECT}/knowledge`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "Hours", text: "Open at nine." }),
      }),
    );
    expect(router.refresh).toHaveBeenCalledOnce();
    expect((screen.getByLabelText("Text") as HTMLTextAreaElement).value).toBe(
      "",
    );
  });

  it("shows the limit message with a Billing link on 402", async () => {
    const user = userEvent.setup();
    renderPanel([source()]);
    reply(402, {
      error: { code: "plan_limit_reached", message: LIMIT_MESSAGE },
    });
    await user.type(
      within(screen.getByRole("form", { name: "Paste text" })).getByLabelText(
        "Title",
      ),
      "Four",
    );
    await user.type(screen.getByLabelText("Text"), "x");
    await user.click(screen.getByRole("button", { name: "Add text" }));

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain(LIMIT_MESSAGE);
    expect(
      within(notice).getByRole("link", { name: "Upgrade to Pro" }),
    ).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows other errors under the form", async () => {
    const user = userEvent.setup();
    renderPanel([]);
    reply(500, {
      error: { code: "internal_error", message: "Something went wrong." },
    });
    await user.type(
      within(screen.getByRole("form", { name: "Paste text" })).getByLabelText(
        "Title",
      ),
      "T",
    );
    await user.type(screen.getByLabelText("Text"), "x");
    await user.click(screen.getByRole("button", { name: "Add text" }));
    expect(screen.getByRole("alert").textContent).toBe("Something went wrong.");
  });
});

describe("upload", () => {
  const uploadForm = () =>
    within(screen.getByRole("form", { name: "Upload a file" }));
  const pick = (f: File) =>
    fireEvent.change(uploadForm().getByLabelText("File"), {
      target: { files: [f] },
    });
  const pdf = () =>
    new File(["%PDF-1.4 hello"], "Returns policy.pdf", {
      type: "application/pdf",
    });

  it("runs upload-url → PUT to the signed URL → finalize, then refreshes", async () => {
    const user = userEvent.setup();
    renderPanel([]);
    const reserved = source({
      type: "pdf",
      status: "uploading",
      title: "Returns policy",
    });
    reply(201, { source: reserved, uploadUrl: SIGNED_URL });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    reply(200, { source: { ...reserved, status: "processing" } });

    const f = pdf();
    pick(f);
    // The title defaults to the file name without its extension.
    expect(
      (uploadForm().getByLabelText("Title") as HTMLInputElement).value,
    ).toBe("Returns policy");
    await user.click(screen.getByRole("button", { name: "Upload file" }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [first, second, third] = fetchMock.mock.calls;
    expect(first![0]).toBe(`/api/projects/${PROJECT}/knowledge/upload-url`);
    expect(JSON.parse(String(first![1]!.body))).toEqual({
      title: "Returns policy",
      fileName: "Returns policy.pdf",
      contentType: "application/pdf",
      sizeBytes: f.size,
    });
    expect(second![0]).toBe(SIGNED_URL);
    expect(second![1]).toMatchObject({
      method: "PUT",
      body: f,
      headers: { "content-type": "application/pdf" },
    });
    expect(third![0]).toBe(`/api/projects/${PROJECT}/knowledge/finalize`);
    expect(JSON.parse(String(third![1]!.body))).toEqual({
      sourceId: reserved.id,
    });
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a 12 MB file and a .docx before any request", () => {
    renderPanel([]);
    const big = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 12 * 1024 * 1024 });
    pick(big);
    expect(screen.getByRole("alert").textContent).toContain(
      "Files can be at most 10 MB",
    );
    expect(
      (screen.getByRole("button", { name: "Upload file" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    pick(
      new File(["x"], "letter.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "Only PDF, Markdown (.md) and TXT",
    );
    expect(
      (screen.getByRole("button", { name: "Upload file" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [413, "file_too_large", "Files can be at most 10 MB."],
    [
      415,
      "unsupported_file_type",
      "This file isn't a PDF. Upload a PDF, Markdown or TXT file.",
    ],
  ])("shows the server's %i refusal", async (status, code, message) => {
    const user = userEvent.setup();
    renderPanel([]);
    reply(status, { error: { code, message } });
    pick(pdf());
    await user.click(screen.getByRole("button", { name: "Upload file" }));
    expect(screen.getByRole("alert").textContent).toBe(message);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows a 415 from finalize", async () => {
    const user = userEvent.setup();
    renderPanel([]);
    reply(201, {
      source: source({ type: "pdf", status: "uploading" }),
      uploadUrl: SIGNED_URL,
    });
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));
    reply(415, {
      error: {
        code: "unsupported_file_type",
        message: "This file isn't a PDF.",
      },
    });
    pick(pdf());
    await user.click(screen.getByRole("button", { name: "Upload file" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "This file isn't a PDF.",
    );
  });

  it("shows the limit message on a 402 from upload-url", async () => {
    const user = userEvent.setup();
    renderPanel([source()]);
    reply(402, {
      error: { code: "plan_limit_reached", message: LIMIT_MESSAGE },
    });
    pick(pdf());
    await user.click(screen.getByRole("button", { name: "Upload file" }));
    expect(
      within(screen.getByRole("alert")).getByRole("link", {
        name: "Upgrade to Pro",
      }),
    ).toBeTruthy();
  });

  it("deletes the reservation when the PUT fails", async () => {
    const user = userEvent.setup();
    renderPanel([]);
    const reserved = source({ type: "pdf", status: "uploading" });
    reply(201, { source: reserved, uploadUrl: SIGNED_URL });
    fetchMock.mockRejectedValueOnce(new TypeError("network"));
    reply(200, { ok: true });
    pick(pdf());
    await user.click(screen.getByRole("button", { name: "Upload file" }));

    expect(fetchMock.mock.calls[2]![0]).toBe(`/api/knowledge/${reserved.id}`);
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({ method: "DELETE" });
    expect(screen.getByRole("alert").textContent).toContain(
      "The upload didn't finish",
    );
  });
});

describe("delete", () => {
  it("asks first, then deletes and refreshes", async () => {
    const user = userEvent.setup();
    const s = source({ title: "FAQ" });
    renderPanel([s]);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = screen.getByRole("group", { name: "Delete FAQ" });
    expect(fetchMock).not.toHaveBeenCalled();

    reply(200, { ok: true });
    await user.click(
      within(confirm).getByRole("button", { name: "Delete source" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/knowledge/${s.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("cancel closes the confirm without a request", async () => {
    const user = userEvent.setup();
    renderPanel([source({ title: "FAQ" })]);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "Delete FAQ" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a failed delete's message", async () => {
    const user = userEvent.setup();
    renderPanel([source({ title: "FAQ" })]);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    reply(404, {
      error: { code: "not_found", message: "Knowledge source not found." },
    });
    await user.click(screen.getByRole("button", { name: "Delete source" }));
    expect(screen.getByRole("alert").textContent).toBe(
      "Knowledge source not found.",
    );
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
