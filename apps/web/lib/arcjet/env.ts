import "server-only";

/**
 * ARCJET_KEY, read at call time (so `next build` passes without it).
 * Server only (project.md §9). Unset or blank → undefined: the caller fails
 * open instead of throwing.
 */
export function readArcjetKey(
  value: string | undefined = process.env.ARCJET_KEY,
): string | undefined {
  const key = value?.trim();
  return key ? key : undefined;
}
