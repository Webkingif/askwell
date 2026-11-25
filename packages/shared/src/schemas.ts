// zod schemas for the enums, plans and widget config. Kept apart from the
// plain values so the widget bundle can import those without pulling in zod.
import { z } from "zod";
import { MAX_WIDGET_HEADER_LENGTH, MAX_WIDGET_LABEL_LENGTH } from "./constants";
import {
  ALLOWED_KNOWLEDGE_MIME_TYPES,
  KNOWLEDGE_FILE_TYPES,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MESSAGE_ROLES,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "./enums";
import { PLANS } from "./plans";
import type { WidgetConfig } from "./widget";

export const planSchema = z.enum(PLANS);
export const knowledgeSourceTypeSchema = z.enum(KNOWLEDGE_SOURCE_TYPES);
export const knowledgeFileTypeSchema = z.enum(KNOWLEDGE_FILE_TYPES);
export const knowledgeMimeTypeSchema = z.enum(ALLOWED_KNOWLEDGE_MIME_TYPES);
export const knowledgeSourceStatusSchema = z.enum(KNOWLEDGE_SOURCE_STATUSES);
export const messageRoleSchema = z.enum(MESSAGE_ROLES);
export const widgetPositionSchema = z.enum(WIDGET_POSITIONS);
export const widgetAnimationSchema = z.enum(WIDGET_ANIMATIONS);

/** A 6-digit hex color, e.g. "#1a2b3c". */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color, like #000000");

export const widgetConfigSchema = z.object({
  buttonColor: hexColorSchema,
  position: widgetPositionSchema,
  label: z.string().trim().min(1).max(MAX_WIDGET_LABEL_LENGTH),
  animation: widgetAnimationSchema,
  headerText: z.string().trim().min(1).max(MAX_WIDGET_HEADER_LENGTH),
  showBadge: z.boolean(),
}) satisfies z.ZodType<WidgetConfig>;
