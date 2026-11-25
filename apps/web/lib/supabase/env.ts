import { z } from "zod";

// Env vars are read when a client is created, never at import time, so
// `next build` passes without any Supabase keys set.
//
// The secret key is deliberately not read here: service.ts is the only file
// that reads it (project.md §9), and passes the value in.

const publishableKeySchema = z
  .string()
  .min(1)
  // A secret key in a NEXT_PUBLIC_* var would ship to the browser.
  .refine((key) => !key.startsWith("sb_secret_"), {
    message: "is a secret key; it must never be in a NEXT_PUBLIC_* var",
  });

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKeySchema,
});

export type SupabasePublicEnv = z.infer<typeof publicEnvSchema>;

/** Throws a single error naming every missing or invalid variable. */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  values: Record<string, string | undefined>,
): z.infer<T> {
  // Treat "" (an unset Vercel var or a blank .env line) as missing.
  const cleaned = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      value === "" ? undefined : value,
    ]),
  );
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join(".");
    return cleaned[name] === undefined
      ? `${name} is not set`
      : `${name} ${issue.message}`;
  });
  throw new Error(`Supabase env: ${problems.join("; ")}`);
}

/** URL and publishable key, shared by both clients. */
export function readSupabasePublicEnv(
  // Named one by one: Next.js only inlines NEXT_PUBLIC_* on direct access.
  values: Record<string, string | undefined> = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
): SupabasePublicEnv {
  return parseEnv(publicEnvSchema, values);
}

/** Schema for the server-only secret key; service.ts supplies the value. */
export const secretKeySchema = z
  .string()
  .min(1)
  .refine((key) => !key.startsWith("sb_publishable_"), {
    message: "is a publishable key, not a secret key",
  });
