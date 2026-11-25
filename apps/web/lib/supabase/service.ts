import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { parseEnv, readSupabasePublicEnv, secretKeySchema } from "./env";
import { z } from "zod";

export type ServiceClient = SupabaseClient<Database>;

const secretEnvSchema = z.object({ SUPABASE_SECRET_KEY: secretKeySchema });

/**
 * Acts as `service_role`: skips RLS and may do anything.
 *
 * Use it ONLY after the route has checked ownership (`getOwnedProject`) and
 * the plan, read on the server. Never for owner reads with a manual owner
 * filter; those go through createOwnerClient() so RLS scopes them.
 *
 * This is the only file that reads the secret key (project.md §9).
 */
export function createServiceClient(): ServiceClient {
  const env = readSupabasePublicEnv();
  const { SUPABASE_SECRET_KEY } = parseEnv(secretEnvSchema, {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
