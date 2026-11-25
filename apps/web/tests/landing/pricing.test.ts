import { PLAN_LIMITS, PLAN_PRICES, WIDGET_ANIMATIONS } from "@askwell/shared";
import { describe, expect, it } from "vitest";
import { buildPricingRows, splitPrice } from "../../components/landing/pricing";

const byLabel = (label: string) => {
  const row = buildPricingRows().find((r) => r.label.startsWith(label));
  if (!row) throw new Error(`no row ${label}`);
  return row.values;
};

describe("buildPricingRows", () => {
  it("reads numbers from PLAN_LIMITS", () => {
    expect(byLabel("Projects")).toEqual({
      free: String(PLAN_LIMITS.free.projects),
      pro: String(PLAN_LIMITS.pro.projects),
    });
    expect(byLabel("Messages")).toEqual({
      free: PLAN_LIMITS.free.messagesPerMonth.toLocaleString("en-US"),
      pro: PLAN_LIMITS.pro.messagesPerMonth.toLocaleString("en-US"),
    });
    expect(byLabel("Knowledge")).toEqual({
      free: String(PLAN_LIMITS.free.knowledgeSources),
      pro: String(PLAN_LIMITS.pro.knowledgeSources),
    });
  });

  it("matches the §5 wording for feature flags", () => {
    expect(byLabel("Button color")).toEqual({ free: "Default", pro: "Any" });
    expect(byLabel("Button position")).toEqual({
      free: "Bottom right",
      pro: "Any corner",
    });
    expect(byLabel("Button label")).toEqual({ free: "Default", pro: "Custom" });
    expect(byLabel("Header text")).toEqual({ free: "Default", pro: "Custom" });
    expect(byLabel("“Powered by”")).toEqual({ free: "Shown", pro: "Hidden" });
    expect(byLabel("Open animation").pro.split(" / ")).toHaveLength(
      WIDGET_ANIMATIONS.length,
    );
    expect(byLabel("Open animation")).toEqual({
      free: "Fade",
      pro: "Fade / Slide / Scale",
    });
  });
});

describe("splitPrice", () => {
  it("splits PLAN_PRICES.display into amount and interval", () => {
    const { amount, per } = splitPrice("pro");
    expect(amount + per).toBe(PLAN_PRICES.pro.display);
    expect(per).toBe("/month");
  });
});
