import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import {
  DEFAULT_WIDGET_CONFIG,
  applyPlanToConfig,
  widgetConfigSchema,
  type WidgetConfig,
} from "./index";

const custom: WidgetConfig = {
  buttonColor: "#ff6600",
  position: "top-left",
  label: "Help",
  animation: "scale",
  headerText: "Hi there",
  showBadge: false,
};

describe("DEFAULT_WIDGET_CONFIG", () => {
  it("is black, bottom-right, fade, badge shown", () => {
    expect(DEFAULT_WIDGET_CONFIG).toEqual({
      buttonColor: "#000000",
      position: "bottom-right",
      label: "Chat with us",
      animation: "fade",
      headerText: "Ask us anything",
      showBadge: true,
    });
    expect(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG).success).toBe(
      true,
    );
  });
});

describe("applyPlanToConfig", () => {
  it("Free gets the defaults and the badge, whatever was saved", () => {
    expect(applyPlanToConfig(custom, "free")).toEqual(DEFAULT_WIDGET_CONFIG);
  });

  it("Pro gets the saved config", () => {
    expect(applyPlanToConfig(custom, "pro")).toEqual(custom);
  });

  it("does not change its input", () => {
    const input = { ...custom };
    applyPlanToConfig(input, "free");
    expect(input).toEqual(custom);
  });
});

describe("widgetConfigSchema", () => {
  it("infers exactly WidgetConfig", () => {
    expectTypeOf<
      z.infer<typeof widgetConfigSchema>
    >().toEqualTypeOf<WidgetConfig>();
  });

  it("accepts a valid config", () => {
    expect(widgetConfigSchema.safeParse(custom).success).toBe(true);
  });

  it.each([
    ["a bad color", { buttonColor: "red" }],
    ["a bad position", { position: "middle" }],
    ["a bad animation", { animation: "spin" }],
    ["an empty label", { label: "  " }],
    ["a long header", { headerText: "x".repeat(61) }],
  ])("rejects %s", (_name, change) => {
    expect(widgetConfigSchema.safeParse({ ...custom, ...change }).success).toBe(
      false,
    );
  });
});
