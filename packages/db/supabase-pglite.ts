// A Supabase-shaped Postgres in memory, for testing migrations and RLS.
// Never a local Supabase stack or a Docker database (CLAUDE.md "Database rules").
//
// It stubs what Supabase provides before our migrations run: the API roles,
// the `auth`, `extensions` and `storage` schemas (storage: just the tables
// migrations touch), `auth.jwt()`, and Supabase's default
// privileges (every new table and function is granted to the API roles), so
// the migrations' revokes are tested against the same starting point.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PGlite, type Results, type Transaction } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

export type SupabaseRole = "anon" | "authenticated" | "service_role";

/** JWT claims, as Clerk sends them (`sub` is the Clerk user id). */
export type JwtClaims = Record<string, unknown> & { sub?: string };

export interface RoleClient {
  /** Run one statement as the role, in its own transaction (committed on success). */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<Results<T>>;
  /** Run several statements as the role, in one transaction. */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
}

export interface SupabasePglite {
  /** The database as `postgres` (superuser; bypasses RLS). */
  db: PGlite;
  /** Act as an API role, with these JWT claims in `request.jwt.claims`. */
  asRole(role: SupabaseRole, claims?: JwtClaims): RoleClient;
  close(): Promise<void>;
}

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL("../../supabase/migrations/", import.meta.url),
);

const SUPABASE_STUB = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema auth;
  create schema extensions;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;

  -- Same body as Supabase's auth.jwt().
  create function auth.jwt() returns jsonb
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
  $$;
  grant execute on function auth.jwt() to anon, authenticated, service_role;

  -- The columns of Supabase's storage.buckets that migrations write.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    owner uuid,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets (id),
    name text
  );
  alter table storage.objects enable row level security;

  -- Supabase grants every new object in public to the API roles.
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on functions to anon, authenticated, service_role;
`;

const ROLES: readonly SupabaseRole[] = [
  "anon",
  "authenticated",
  "service_role",
];

/** Migration files in apply order (their names start with a UTC timestamp). */
export async function listMigrations(
  dir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<string[]> {
  const files = await readdir(dir);
  return files
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => `${dir}${dir.endsWith("/") ? "" : "/"}${f}`);
}

export async function createSupabasePglite(
  options: { migrationsDir?: string } = {},
): Promise<SupabasePglite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);

  for (const file of await listMigrations(options.migrationsDir)) {
    const sql = await readFile(file, "utf8");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration failed: ${file}`, { cause: error });
    }
  }

  function asRole(role: SupabaseRole, claims: JwtClaims = {}): RoleClient {
    if (!ROLES.includes(role)) throw new Error(`Unknown role: ${role}`);
    const json = JSON.stringify({ role, ...claims });

    async function transaction<T>(
      fn: (tx: Transaction) => Promise<T>,
    ): Promise<T> {
      return db.transaction(async (tx) => {
        await tx.query("select set_config('request.jwt.claims', $1, true)", [
          json,
        ]);
        // role is one of ROLES, checked above.
        await tx.exec(`set local role ${role}`);
        return fn(tx);
      });
    }

    return {
      transaction,
      query: <T>(sql: string, params?: unknown[]) =>
        transaction((tx) => tx.query<T>(sql, params)),
    };
  }

  return { db, asRole, close: () => db.close() };
}
