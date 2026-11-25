import { APP_NAME } from "@askwell/shared";
import { describe, expect, it, vi } from "vitest";
import { boot, bootMessage } from "./index";

describe("widget stub", () => {
  it("names the app in its boot message", () => {
    expect(bootMessage()).toContain(APP_NAME);
  });

  it("logs once on boot and does nothing else", () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    boot();
    expect(debug).toHaveBeenCalledExactlyOnceWith(bootMessage());
    debug.mockRestore();
  });
});
