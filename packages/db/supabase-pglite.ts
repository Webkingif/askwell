// A Supabase-shaped Postgres in memory, for testing migrations and RLS.
// Never a local Supabase stack or a Docker database (CLAUDE.md "Database rules").
//
// It stubs what Supabase provides before our migrations run: the API roles,
// the `auth`, `extensions` and `storage` schemas (storage: just the tables
// migrations touch), `auth.jwt()`, pgvector, and Supabase's default
// privileges (every new table and function is granted to the API roles), so
// the migrations' revokes are tested against the same starting point.
//
// Migrations run as MIGRATION_ROLE, a non-superuser shaped like Supabase's
// `postgres` role (Supabase's migration role is not a superuser), each in a
// fresh session: the database is dumped and reloaded into a new PGlite between
// migrations, so a library one migration loads (e.g. pgvector's) is not
// already loaded for the next one, as on Supabase's migration API. A migration
// that needs superuser fails here as it would on dev, e.g. PR #26's
// `create function ... set hnsw.iterative_scan` before pgvector is loaded
// ("permission denied to set parameter").
//
// Known gaps (pglite can't model these exactly):
// - The role is `supabase_postgres`, not `postgres`: pglite's bootstrap
//   superuser already has that name. No migration names the role.
// - pglite's pgvector is not a trusted extension, and Supabase lets its
//   `postgres` role create it anyway (supautils). The stub creates `vector`
//   as superuser, so a migration's `create extension if not exists vector` is
//   a no-op here. Creating any other extension needs the stub to do the same.
// - Supabase applies each migration through the MCP in its own session; a
//   `supabase db push` of several migrations may share one. A fresh session per
//   migration is the stricter of the two.
// - Supabase's `postgres` also has CREATEDB, REPLICATION and other grants
//   (pg_read_all_data, and so on) that no migration relies on; not modelled.
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
  /** The database as pglite's `postgres` (superuser; bypasses RLS). */
  db: PGlite;
  /** Act as an API role, with these JWT claims in `request.jwt.claims`. */
  asRole(role: SupabaseRole, claims?: JwtClaims): RoleClient;
  close(): Promise<void>;
}

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL("../../supabase/migrations/", import.meta.url),
);

/** The non-superuser role migrations run as (Supabase's `postgres`). */
export const MIGRATION_ROLE = "supabase_postgres";

// Runs as superuser: Supabase provides all of this before our migrations.
const SUPABASE_STUB = /* sql */ `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  -- Supabase's postgres: not a superuser; CREATEROLE, BYPASSRLS; a member of
  -- the API roles; owns the public schema.
  create role ${MIGRATION_ROLE} login nosuperuser createrole bypassrls;
  grant anon, authenticated, service_role to ${MIGRATION_ROLE} with admin option;
  alter schema public owner to ${MIGRATION_ROLE};

  create schema auth;
  create schema extensions;
  grant usage on schema public, auth, extensions to anon, authenticated, service_role;
  grant usage on schema auth, extensions to ${MIGRATION_ROLE};

  -- See the header: Supabase lets its postgres create vector; pglite doesn't.
  create extension vector with schema extensions;

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

  -- Supabase's storage.buckets (same column types and defaults), the only
  -- storage object migrations touch.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    owner uuid,
    owner_id text,
    public boolean default false,
    avif_autodetection boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[],
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  );
  create unique index bname on storage.buckets (name);
  grant usage on schema storage to ${MIGRATION_ROLE};
  grant all on table storage.buckets to ${MIGRATION_ROLE};

  -- Supabase grants every object its postgres creates in public to the API
  -- roles.
  alter default privileges for role ${MIGRATION_ROLE} in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges for role ${MIGRATION_ROLE} in schema public
    grant all on sequences to anon, authenticated, service_role;
  alter default privileges for role ${MIGRATION_ROLE} in schema public
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

/** Close the database and open its data in a new PGlite (a new session). */
async function reopen(db: PGlite): Promise<PGlite> {
  const data = await db.dumpDataDir("none");
  await db.close();
  const next: PGlite = await PGlite.create({
    extensions: { vector },
    loadDataDir: data,
  });
  return next;
}

export async function createSupabasePglite(
  options: { migrationsDir?: string } = {},
): Promise<SupabasePglite> {
  let db: PGlite = await PGlite.create({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);

  for (const file of await listMigrations(options.migrationsDir)) {
    // A fresh session per migration (see the header).
    db = await reopen(db);
    const sql = await readFile(file, "utf8");
    try {
      await db.exec(`set role ${MIGRATION_ROLE}`);
      await db.exec(sql);
      await db.exec("reset role");
    } catch (error) {
      await db.close();
      throw new Error(`Migration failed: ${file}`, { cause: error });
    }
  }
  db = await reopen(db);

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
