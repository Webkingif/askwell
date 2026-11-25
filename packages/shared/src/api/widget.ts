// Public routes, called by the widget (project.md §8 "Public").
import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "../constants";
import type { WidgetConfig } from "../widget";
import { idSchema, publicKeySchema } from "./common";

/** GET /api/widget/config?key=pk_... */
export const widgetConfigQuerySchema = z.object({ key: publicKeySchema });
export type WidgetConfigQuery = z.infer<typeof widgetConfigQuerySchema>;

export interface WidgetConfigResponse {
  /** Already plan-applied: Free gets the defaults and the badge. */
  config: WidgetConfig;
}

/** POST /api/widget/chat */
export const widgetChatRequestSchema = z.object({
  key: publicKeySchema,
  /** Random id from the panel's localStorage. */
  visitorId: z.uuid(),
  /** Omit on the first message; the server creates the conversation. */
  conversationId: idSchema.optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type WidgetChatRequest = z.infer<typeof widgetChatRequestSchema>;

export interface WidgetChatResponse {
  conversationId: string;
  reply: string;
}
