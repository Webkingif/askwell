// Widget config: its shape, defaults, and what each plan may change (project.md §6.5, §6.8).
// No zod here: the widget bundle imports this. The schema is in schemas.ts.
import type { WidgetAnimation, WidgetPosition } from "./enums";
import { PLAN_LIMITS, type Plan } from "./plans";

export interface WidgetConfig {
  /** 6-digit hex, e.g. "#000000". */
  buttonColor: string;
  position: WidgetPosition;
  label: string;
  animation: WidgetAnimation;
  headerText: string;
  showBadge: boolean;
}

export const DEFAULT_WIDGET_CONFIG: Readonly<WidgetConfig> = Object.freeze({
  buttonColor: "#000000",
  position: "bottom-right",
  label: "Chat with us",
  animation: "fade",
  headerText: "Ask us anything",
  showBadge: true,
});

/**
 * The config the widget actually shows: each field the plan may not change
 * falls back to its default. Free gets the defaults with the badge;
 * Pro gets the saved config.
 */
export function applyPlanToConfig(
  config: WidgetConfig,
  plan: Plan,
): WidgetConfig {
  const limits = PLAN_LIMITS[plan];
  const d = DEFAULT_WIDGET_CONFIG;
  const animations: readonly string[] = limits.animationsAllowed;
  return {
    buttonColor: limits.customColor ? config.buttonColor : d.buttonColor,
    position: limits.anyPosition ? config.position : d.position,
    label: limits.customLabel ? config.label : d.label,
    animation: animations.includes(config.animation)
      ? config.animation
      : d.animation,
    headerText: limits.customHeader ? config.headerText : d.headerText,
    showBadge: limits.badgeHidden ? config.showBadge : true,
  };
}
