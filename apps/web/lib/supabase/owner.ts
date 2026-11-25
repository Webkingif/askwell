import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { readSupabasePublicEnv } from "./env";

export type OwnerClient = SupabaseClient<Database>;

/**
 * The signed-in owner's client, for server components and route handlers.
 *
 * Sends the owner's Clerk session token (Supabase third-party auth), so RLS
 * scopes every read to their own rows. Use it for all owner reads; never the
 * service client with a manual owner filter (project.md §9).
 *
 * Callers still check `auth()` themselves first. With no session the token is
 * null, the request runs as `anon`, and `anon` may read nothing.
 */
export function createOwnerClient(): OwnerClient {
  const env = readSupabasePublicEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // Called before each request, so the token is always the current one.
      accessToken: async () => (await auth()).getToken(),
    },
  );
}
