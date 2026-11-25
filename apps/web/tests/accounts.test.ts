import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const clerk = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: clerk.userId }),
}));

type Row = { clerk_user_id: string; plan: string };
type DbError = { code: string; message: string } | null;

/** A tiny in-memory `accounts` table behind fake service and owner clients. */
const db = vi.hoisted(() => ({
  rows: new Map<string, { clerk_user_id: string; plan: string }>(),
  upserts: [] as { values: unknown; options: unknown }[],
  insertError: null as { code: string; message: string } | null,
  readError: null as { code: string; message: string } | null,
  /** Who RLS lets the owner client see; null = nobody (no token). */
  ownerSub: null as string | null,
  ownerFilters: [] as [string, string][],
}));

vi.mock("../lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      expect(table).toBe("accounts");
      return {
        upsert: async (
          values: { clerk_user_id: string },
          options: { onConflict: string; ignoreDuplicates: boolean },
        ) => {
          db.upserts.push({ values, options });
          if (db.insertError) return { error: db.insertError };
          // ON CONFLICT DO NOTHING when ignoreDuplicates, else overwrite.
          const existing = db.rows.get(values.clerk_user_id);
          if (!existing || !options.ignoreDuplicates) {
            db.rows.set(values.clerk_user_id, {
              plan: "free",
              ...existing,
              ...values,
            });
          }
          return { error: null };
        },
      };
    },
  }),
}));

vi.mock("../lib/supabase/owner", () => ({
  createOwnerClient: () => ({
    from: (table: string) => {
      expect(table).toBe("accounts");
      const filters: [string, string][] = [];
      const query = {
        select: (cols: string) => {
          expect(cols).toBe("clerk_user_id, plan");
          return query;
        },
        eq: (col: string, value: string) => {
          filters.push([col, value]);
          db.ownerFilters.push([col, value]);
          return query;
        },
        maybeSingle: async (): Promise<{
          data: Row | null;
          error: DbError;
        }> => {
          if (db.readError) return { data: null, error: db.readError };
          // RLS: only the owner's own row is visible.
          const visible = [...db.rows.values()].filter(
            (r) =>
              r.clerk_user_id === db.ownerSub &&
              filters.every(([c, v]) => r[c as keyof Row] === v),
          );
          return { data: visible[0] ?? null, error: null };
        },
      };
      return query;
    },
  }),
}));

const { ensureAccount, NotSignedInError } = await import("../lib/accounts");

function signIn(id: string) {
  clerk.userId = id;
  db.ownerSub = id;
}

beforeEach(() => {
  clerk.userId = null;
  db.rows.clear();
  db.upserts = [];
  db.insertError = null;
  db.readError = null;
  db.ownerSub = null;
  db.ownerFilters = [];
});

describe("ensureAccount", () => {
  it("creates a free account on first visit", async () => {
    signIn("user_new");
    await expect(ensureAccount()).resolves.toEqual({
      clerk_user_id: "user_new",
      plan: "free",
    });
    expect([...db.rows.values()]).toEqual([
      { clerk_user_id: "user_new", plan: "free" },
    ]);
  });

  it("inserts only the Clerk user ID, ignore-on-conflict", async () => {
    signIn("user_new");
    await ensureAccount();
    expect(db.upserts).toEqual([
      {
        values: { clerk_user_id: "user_new" },
        options: { onConflict: "clerk_user_id", ignoreDuplicates: true },
      },
    ]);
  });

  it("leaves an existing account alone: a pro plan stays pro", async () => {
    db.rows.set("user_pro", { clerk_user_id: "user_pro", plan: "pro" });
    signIn("user_pro");
    await expect(ensureAccount()).resolves.toEqual({
      clerk_user_id: "user_pro",
      plan: "pro",
    });
    expect(db.rows.get("user_pro")).toEqual({
      clerk_user_id: "user_pro",
      plan: "pro",
    });
    expect(db.rows.size).toBe(1);
  });

  it("is idempotent: repeat and concurrent loads keep one row", async () => {
    signIn("user_a");
    await Promise.all([ensureAccount(), ensureAccount(), ensureAccount()]);
    await ensureAccount();
    expect(db.rows.size).toBe(1);
    expect(db.rows.get("user_a")?.plan).toBe("free");
  });

  it("uses the Clerk user ID for both the insert and the read", async () => {
    db.rows.set("user_other", { clerk_user_id: "user_other", plan: "pro" });
    signIn("user_me");
    const account = await ensureAccount();
    expect(account.clerk_user_id).toBe("user_me");
    expect(db.upserts[0]?.values).toEqual({ clerk_user_id: "user_me" });
    expect(db.ownerFilters).toEqual([["clerk_user_id", "user_me"]]);
    expect(db.rows.get("user_other")?.plan).toBe("pro");
  });

  it("throws NotSignedInError with no session, and writes nothing", async () => {
    await expect(ensureAccount()).rejects.toBeInstanceOf(NotSignedInError);
    expect(db.upserts).toEqual([]);
    expect(db.rows.size).toBe(0);
  });

  it("throws when the insert fails, without leaking the user ID", async () => {
    signIn("user_secret_id");
    db.insertError = { code: "42501", message: "permission denied" };
    const err = await ensureAccount().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("ensureAccount: insert failed (42501)");
  });

  it("throws when the read fails", async () => {
    signIn("user_a");
    db.readError = { code: "PGRST301", message: "JWT invalid" };
    await expect(ensureAccount()).rejects.toThrow(
      "ensureAccount: read failed (PGRST301)",
    );
  });

  it("throws when RLS hides the row (owner token not reaching Supabase)", async () => {
    signIn("user_a");
    db.ownerSub = null;
    await expect(ensureAccount()).rejects.toThrow(
      "ensureAccount: account not visible to owner",
    );
  });

  it("rejects a plan value it doesn't know", async () => {
    db.rows.set("user_a", { clerk_user_id: "user_a", plan: "enterprise" });
    signIn("user_a");
    await expect(ensureAccount()).rejects.toThrow(
      "ensureAccount: unknown plan",
    );
  });
});
