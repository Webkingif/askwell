// Pieces reused by several routes.
import { z } from "zod";
import { PUBLIC_KEY_PATTERN } from "../constants";

/** A database row id. */
export const idSchema = z.uuid();

/** Route params for `/:id` routes. */
export const idParamsSchema = z.object({ id: idSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

/** A project's public key (`pk_...`), used by the widget. */
export const publicKeySchema = z
  .string()
  .regex(PUBLIC_KEY_PATTERN, "Not a valid public key");

/** ISO 8601 timestamp, as sent over JSON. */
export type IsoDateString = string;

/** Body of a successful request that returns nothing else (e.g. a delete). */
export interface OkResponse {
  ok: true;
}
