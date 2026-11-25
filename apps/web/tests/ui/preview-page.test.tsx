import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import UiPreviewPage from "../../app/ui/page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

describe("/ui preview page", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows every component on light and dark surfaces outside production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    const html = renderToStaticMarkup(<UiPreviewPage />);
    expect(html).toContain("surface-light");
    expect(html).toContain("surface-dark");
    for (const text of [
      "Primary",
      "Secondary",
      "Ghost",
      "Bot name",
      "Pro",
      "No conversations yet",
      "Loading conversations",
      "Couldn&#x27;t load conversations",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("is not found in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => renderToStaticMarkup(<UiPreviewPage />)).toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
