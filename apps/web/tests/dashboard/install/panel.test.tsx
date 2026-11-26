// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { InstallPanel } from "../../../components/install";

const SNIPPET =
  '<script src="https://app.example.com/widget.js" data-key="pk_aaaaaaaaaaaaaaaaaaaa" async></script>';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("InstallPanel", () => {
  it("shows the snippet as text, never as HTML, and three steps", () => {
    const html = renderToStaticMarkup(<InstallPanel snippet={SNIPPET} />);
    expect(html).toContain("&lt;script src=");
    expect(html).not.toContain("<script");
    render(<InstallPanel snippet={SNIPPET} />);
    expect(screen.getByText(SNIPPET).tagName).toBe("CODE");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/just before/).textContent).toContain("</body>");
  });

  it("Copy writes the exact snippet to the clipboard and says Copied", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
      writeText,
    } as unknown as Clipboard);
    render(<InstallPanel snippet={SNIPPET} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(SNIPPET);
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(screen.getByText("Copied to your clipboard.")).toBeTruthy();
  });

  it("goes back to Copy after a moment", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
      writeText: async () => {},
    } as unknown as Clipboard);
    render(<InstallPanel snippet={SNIPPET} />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(2500));
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });

  it("falls back to selecting the snippet when the clipboard refuses", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator, "clipboard", "get").mockReturnValue({
      writeText: async () => {
        throw new DOMException("denied", "NotAllowedError");
      },
    } as unknown as Clipboard);
    render(<InstallPanel snippet={SNIPPET} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByText(/Press Ctrl\+C/)).toBeTruthy();
    expect(window.getSelection()?.toString()).toBe(SNIPPET);
  });
});
