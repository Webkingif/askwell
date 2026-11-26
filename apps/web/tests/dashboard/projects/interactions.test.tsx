// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@askwell/shared";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const { ProjectList } = await import("../../../components/projects");

const fetchMock = vi.fn<typeof fetch>();

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

const SITE: Project = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "My site",
  publicKey: "pk_aaaaaaaaaaaaaaaaaaaa",
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00+00:00",
  createdAt: "2026-11-26T10:00:00+00:00",
};

const LIMIT_MESSAGE =
  "The Free plan includes 1 project. Upgrade to Pro for more.";

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  router.refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("create", () => {
  it("creates from the empty state and refreshes the list", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[]} />);
    expect(screen.getByText("Create your first project")).toBeTruthy();

    reply(201, { project: SITE });
    await user.type(screen.getByLabelText("Project name"), "My site");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "My site" }),
      }),
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByLabelText("Project name") as HTMLInputElement).value,
    ).toBe("");
  });

  it("on 402 shows the server's message and a link to billing, and doesn't refresh", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[SITE]} />);

    reply(402, {
      error: { code: "plan_limit_reached", message: LIMIT_MESSAGE },
    });
    await user.type(screen.getByLabelText("Project name"), "Second");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    const prompt = await screen.findByRole("alert");
    expect(prompt.textContent).toContain(LIMIT_MESSAGE);
    const link = within(prompt).getByRole("link", { name: "Upgrade to Pro" });
    expect(link.getAttribute("href")).toBe("/dashboard/billing");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("shows a 400 message on the field", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[]} />);

    reply(400, {
      error: { code: "invalid_request", message: "Name is too long." },
    });
    await user.type(screen.getByLabelText("Project name"), "x");
    await user.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByText("Name is too long.")).toBeTruthy();
    expect(
      screen.getByLabelText("Project name").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(screen.queryByRole("link", { name: "Upgrade to Pro" })).toBeNull();
  });

  it("keeps Create disabled for a blank name", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[]} />);
    const button = screen.getByRole("button", { name: "Create project" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText("Project name"), "   ");
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rename", () => {
  it("PATCHes the new name and refreshes", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[SITE]} />);

    await user.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByLabelText("New name");
    await user.clear(input);
    await user.type(input, "Renamed");
    reply(200, { project: { ...SITE, name: "Renamed" } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${SITE.id}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Renamed" }),
      }),
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("New name")).toBeNull();
  });

  it("shows the server's error and stays in edit mode", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[SITE]} />);
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.type(screen.getByLabelText("New name"), "!");
    reply(404, { error: { code: "not_found", message: "Project not found." } });
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Project not found.")).toBeTruthy();
    expect(screen.getByLabelText("New name")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("Cancel leaves the name alone and sends nothing", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[SITE]} />);
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.type(screen.getByLabelText("New name"), " edited");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("link", { name: "My site" })).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("requires typing the project name before it sends DELETE", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[SITE]} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = screen.getByRole("button", { name: "Delete project" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    // Pressing Enter in the field with the wrong name sends nothing.
    const input = screen.getByLabelText("Project name to confirm");
    await user.type(input, "My sit{Enter}");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    await user.type(input, "e");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    reply(200, { ok: true });
    await user.click(confirm);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/projects/${SITE.id}`,
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes the confirm step without deleting", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[SITE]} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Project name to confirm")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's error if the delete fails", async () => {
    const user = userEvent.setup();
    render(<ProjectList projects={[SITE]} />);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.type(
      screen.getByLabelText("Project name to confirm"),
      "My site",
    );
    reply(500, {
      error: { code: "internal_error", message: "Something went wrong." },
    });
    await user.click(screen.getByRole("button", { name: "Delete project" }));
    expect(await screen.findByText("Something went wrong.")).toBeTruthy();
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
