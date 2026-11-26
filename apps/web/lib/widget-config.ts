import "server-only";
import {
  DEFAULT_WIDGET_CONFIG,
  applyPlanToConfig,
  planSchema,
  widgetConfigSchema,
  type WidgetConfig,
} from "@askwell/shared";
import { createServiceClient } from "./supabase/service";

// The widget's config for a public key (project.md §6.5, §8 Public).
//
// Called with no signed-in owner (the loader on any website, and the /embed
// panel), so it reads with the service client, resolving the project from
// public_key only (§7). The plan comes from the owner's accounts row, never
// from the request (§9 Plan bypass). Only WidgetConfig fields come back: no
// project id, owner id or usage (§9 Public key abuse).

const SELECT =
  "widget_configs (button_color, position, label, animation, header_text, show_badge), accounts (plan)";

/** The plan-applied config, or null when no project has this key. `key` is already validated. */
export async function getWidgetConfigByKey(
  key: string,
): Promise<WidgetConfig | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select(SELECT)
    .eq("public_key", key)
    .maybeSingle();
  if (error) {
    throw new Error(`widget-config: read failed (${error.code || "no code"})`, {
      cause: error,
    });
  }
  if (!data) return null;

  // Every project gets its row in create_project; fall back to the defaults
  // rather than break the widget if one is ever missing.
  const row = data.widget_configs;
  const saved = row
    ? widgetConfigSchema.safeParse({
        buttonColor: row.button_color,
        position: row.position,
        label: row.label,
        animation: row.animation,
        headerText: row.header_text,
        showBadge: row.show_badge,
      })
    : null;
  if (saved && !saved.success) {
    throw new Error("widget-config: saved config is invalid");
  }

  // An unknown plan gets Free's limits, never more.
  const plan = planSchema.catch("free").parse(data.accounts?.plan);
  return applyPlanToConfig(saved?.data ?? { ...DEFAULT_WIDGET_CONFIG }, plan);
}
