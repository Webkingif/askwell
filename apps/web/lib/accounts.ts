import "server-only";
import { auth } from "@clerk/nextjs/server";
import { planSchema, type Plan } from "@askwell/shared";
import { createOwnerClient } from "./supabase/owner";
import { createServiceClient } from "./supabase/service";

export interface Account {
  clerk_user_id: string;
  plan: Plan;
}

/** No Clerk session on this request. */
export class NotSignedInError extends Error {
  constructor() {
    super("ensureAccount: not signed in");
    this.name = "NotSignedInError";
  }
}

/**
 * Makes sure the signed-in owner has an `accounts` row, and returns it.
 *
 * - The user ID comes only from Clerk's `auth()` on the server, never input.
 * - Owners can't insert into `accounts` (project.md §7), so the insert uses
 *   the service client. It's `INSERT … ON CONFLICT DO NOTHING`: a new row
 *   gets the table default `plan = 'free'`, and an existing row (and its
 *   plan) is never touched. Two concurrent first loads both succeed; one
 *   inserts, the other does nothing.
 * - The row is read back through the owner client, so RLS scopes it.
 *
 * Errors never include the user ID or key material.
 */
export async function ensureAccount(): Promise<Account> {
  const { userId } = await auth();
  if (!userId) throw new NotSignedInError();

  const { error: insertError } = await createServiceClient()
    .from("accounts")
    .upsert(
      { clerk_user_id: userId },
      { onConflict: "clerk_user_id", ignoreDuplicates: true },
    );
  if (insertError) {
    throw new Error(`ensureAccount: insert failed (${insertError.code})`);
  }

  const { data, error: readError } = await createOwnerClient()
    .from("accounts")
    .select("clerk_user_id, plan")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (readError) {
    throw new Error(`ensureAccount: read failed (${readError.code})`);
  }
  // The row exists (we just ensured it), so null means RLS hid it: the
  // owner's Clerk token isn't reaching Supabase.
  if (!data) throw new Error("ensureAccount: account not visible to owner");

  const plan = planSchema.safeParse(data.plan);
  if (!plan.success) throw new Error("ensureAccount: unknown plan");
  return { clerk_user_id: data.clerk_user_id, plan: plan.data };
}
