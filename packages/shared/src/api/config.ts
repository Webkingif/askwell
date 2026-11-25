// Owner route: saving the widget config (project.md §6.8, §8).
import { z } from "zod";
import { widgetConfigSchema } from "../schemas";
import type { WidgetConfig } from "../widget";

/**
 * PATCH /api/projects/:id/config. Params: `idParamsSchema`.
 * Any subset of fields, at least one. Free → 402 `plan_required`.
 */
export const updateWidgetConfigRequestSchema = widgetConfigSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Send at least one field to change",
  });
export type UpdateWidgetConfigRequest = z.infer<
  typeof updateWidgetConfigRequestSchema
>;
export interface UpdateWidgetConfigResponse {
  /** The full saved config. */
  config: WidgetConfig;
}
