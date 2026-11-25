// Plans: the only place plan limits and prices live (project.md §5). No zod here.
import { WIDGET_ANIMATIONS, type WidgetAnimation } from "./enums";

export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  /** Projects per account. */
  readonly projects: number;
  /** Accepted visitor messages per project per monthly period. */
  readonly messagesPerMonth: number;
  /** Knowledge sources per project (files and pasted texts together). */
  readonly knowledgeSources: number;
  /** May pick any button color (else the default). */
  readonly customColor: boolean;
  /** May place the button in any corner (else bottom right). */
  readonly anyPosition: boolean;
  /** May set the button label (else the default). */
  readonly customLabel: boolean;
  /** Open animations the plan may use. */
  readonly animationsAllowed: readonly WidgetAnimation[];
  /** May set the panel header text (else the default). */
  readonly customHeader: boolean;
  /** May hide the "Powered by" badge. */
  readonly badgeHidden: boolean;
}

export const PLAN_LIMITS = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    customColor: false,
    anyPosition: false,
    customLabel: false,
    animationsAllowed: ["fade"],
    customHeader: false,
    badgeHidden: false,
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
    customColor: true,
    anyPosition: true,
    customLabel: true,
    animationsAllowed: WIDGET_ANIMATIONS,
    customHeader: true,
    badgeHidden: true,
  },
} as const satisfies Record<Plan, PlanLimits>;

export interface PlanPrice {
  /** Price per billing interval, in US cents. */
  readonly cents: number;
  readonly currency: "usd";
  readonly interval: "month";
  /** Ready to show, e.g. "$19/month". */
  readonly display: string;
}

export const PLAN_PRICES = {
  free: { cents: 0, currency: "usd", interval: "month", display: "$0/month" },
  pro: {
    cents: 1900,
    currency: "usd",
    interval: "month",
    display: "$19/month",
  },
} as const satisfies Record<Plan, PlanPrice>;
