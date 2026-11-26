import { afterEach, describe, expect, it, vi } from "vitest";
import { projectsApi } from "../../../components/projects/api";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );

afterEach(() => fetchMock.mockReset());

describe("projectsApi", () => {
  it("POSTs the name and returns the project", async () => {
    reply(201, { project: { id: "p1", name: "Site" } });
    const result = await projectsApi.create("Site");
    expect(result).toEqual({
      ok: true,
      data: { project: { id: "p1", name: "Site" } },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Site" }),
    });
  });

  it("passes on the server's 402 plan_limit_reached message", async () => {
    reply(402, {
      error: {
        code: "plan_limit_reached",
        message: "The Free plan includes 1 project.",
      },
    });
    await expect(projectsApi.create("Second")).resolves.toEqual({
      ok: false,
      code: "plan_limit_reached",
      message: "The Free plan includes 1 project.",
    });
  });

  it("passes on a 400 message", async () => {
    reply(400, {
      error: { code: "invalid_request", message: "Give the project a name." },
    });
    await expect(projectsApi.rename("p1", "")).resolves.toMatchObject({
      ok: false,
      code: "invalid_request",
      message: "Give the project a name.",
    });
  });

  it("PATCHes and DELETEs the encoded project URL", async () => {
    reply(200, { project: {} });
    await projectsApi.rename("a/b", "X");
    reply(200, { ok: true });
    await projectsApi.remove("p1");
    expect(
      fetchMock.mock.calls.map(([url, init]) => [url, init?.method]),
    ).toEqual([
      ["/api/projects/a%2Fb", "PATCH"],
      ["/api/projects/p1", "DELETE"],
    ]);
  });

  it("falls back to a generic message for a body that isn't an API error", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>oops</html>", { status: 502 }),
    );
    await expect(projectsApi.remove("p1")).resolves.toEqual({
      ok: false,
      code: "internal_error",
      message: "Something went wrong. Try again.",
    });
  });

  it("reports a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(projectsApi.create("X")).resolves.toMatchObject({
      ok: false,
      code: "network_error",
    });
  });
});
