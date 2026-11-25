import {
  PLAN_LIMITS,
  PLAN_PRICES,
  PLANS,
  type Plan,
  type WidgetAnimation,
} from "@askwell/shared";

export interface PricingRow {
  label: string;
  values: Record<Plan, string>;
}

const count = (n: number) => n.toLocaleString("en-US");

const animationName = (a: WidgetAnimation) =>
  a.charAt(0).toUpperCase() + a.slice(1);

/** One row per plan feature, built from PLAN_LIMITS and PLAN_PRICES (project.md §5). */
export function buildPricingRows(): PricingRow[] {
  const row = (label: string, value: (plan: Plan) => string): PricingRow => ({
    label,
    values: Object.fromEntries(PLANS.map((p) => [p, value(p)])) as Record<
      Plan,
      string
    >,
  });

  return [
    row("Projects", (p) => count(PLAN_LIMITS[p].projects)),
    row("Messages / month (per project)", (p) =>
      count(PLAN_LIMITS[p].messagesPerMonth),
    ),
    row("Knowledge sources (per project)", (p) =>
      count(PLAN_LIMITS[p].knowledgeSources),
    ),
    row("Button color", (p) =>
      PLAN_LIMITS[p].customColor ? "Any" : "Default",
    ),
    row("Button position", (p) =>
      PLAN_LIMITS[p].anyPosition ? "Any corner" : "Bottom right",
    ),
    row("Button label", (p) =>
      PLAN_LIMITS[p].customLabel ? "Custom" : "Default",
    ),
    row("Open animation", (p) =>
      PLAN_LIMITS[p].animationsAllowed.map(animationName).join(" / "),
    ),
    row("Header text", (p) =>
      PLAN_LIMITS[p].customHeader ? "Custom" : "Default",
    ),
    row("“Powered by” badge", (p) =>
      PLAN_LIMITS[p].badgeHidden ? "Hidden" : "Shown",
    ),
  ];
}

export const PLAN_NAMES: Record<Plan, string> = { free: "Free", pro: "Pro" };

/** Splits PLAN_PRICES display text into the amount and the "/interval" part. */
export function splitPrice(plan: Plan): { amount: string; per: string } {
  const { display } = PLAN_PRICES[plan];
  const i = display.indexOf("/");
  return i === -1
    ? { amount: display, per: "" }
    : { amount: display.slice(0, i), per: display.slice(i) };
}
