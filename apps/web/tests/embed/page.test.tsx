import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getWidgetConfigByKey = vi.fn();
vi.mock("../../lib/widget-config", () => ({
  getWidgetConfigByKey: (key: string) => getWidgetConfigByKey(key),
}));

const { EmbedContent } = await import("../../components/embed/EmbedContent");

const KEY = "pk_test_0123456789abcdef";

async function renderFor(key: string | string[] | undefined) {
  const el = await EmbedContent({ searchParams: Promise.resolve({ key }) });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  getWidgetConfigByKey.mockReset();
});

describe("/embed", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["malformed", "bad"],
    ["repeated", [KEY, KEY]],
  ])(
    "shows the unavailable state for a %s key, without a lookup",
    async (_, key) => {
      const html = await renderFor(key);
      expect(html).toContain("This chat isn&#x27;t available");
      expect(getWidgetConfigByKey).not.toHaveBeenCalled();
    },
  );

  it("shows the unavailable state for an unknown key", async () => {
    getWidgetConfigByKey.mockResolvedValue(null);
    const html = await renderFor(KEY);
    expect(getWidgetConfigByKey).toHaveBeenCalledWith(KEY);
    expect(html).toContain("This chat isn&#x27;t available");
  });

  it("shows the unavailable state when the config read fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    getWidgetConfigByKey.mockRejectedValue(new Error("read failed (XX000)"));
    const html = await renderFor(KEY);
    expect(html).toContain("This chat isn&#x27;t available");
    expect(err).toHaveBeenCalledOnce();
    err.mockRestore();
  });

  it("shows the panel with the plan-applied config for a valid key", async () => {
    getWidgetConfigByKey.mockResolvedValue({
      ...DEFAULT_WIDGET_CONFIG,
      headerText: "Ask Acme",
    });
    const html = await renderFor(KEY);
    expect(html).toContain("Ask Acme");
    expect(html).toContain("Powered by");
    expect(html).not.toContain("isn&#x27;t available");
  });
});
