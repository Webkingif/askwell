import { describe, expect, it } from "vitest";
import { PLAN_LIMITS, PLAN_PRICES, planSchema } from "./index";

describe("PLAN_LIMITS (project.md §5)", () => {
  it("Free matches §5", () => {
    expect(PLAN_LIMITS.free).toEqual({
      projects: 1,
      messagesPerMonth: 100,
      knowledgeSources: 3,
      customColor: false,
      anyPosition: false,
      customLabel: false,
      animationsAllowed: ["fade"],
      customHeader: false,
      badgeHidden: false,
    });
  });

  it("Pro matches §5", () => {
    expect(PLAN_LIMITS.pro).toEqual({
      projects: 5,
      messagesPerMonth: 2000,
      knowledgeSources: 25,
      customColor: true,
      anyPosition: true,
      customLabel: true,
      animationsAllowed: ["fade", "slide", "scale"],
      customHeader: true,
      badgeHidden: true,
    });
  });
});

describe("PLAN_PRICES", () => {
  it("Free is $0 and Pro is $19/month", () => {
    expect(PLAN_PRICES.free.cents).toBe(0);
    expect(PLAN_PRICES.pro).toEqual({
      cents: 1900,
      currency: "usd",
      interval: "month",
      display: "$19/month",
    });
  });
});

describe("planSchema", () => {
  it("accepts free and pro, rejects others", () => {
    expect(planSchema.safeParse("pro").success).toBe(true);
    expect(planSchema.safeParse("enterprise").success).toBe(false);
  });
});
