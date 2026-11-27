// Migrations run as a non-superuser in a fresh session each, as on Supabase,
// so a migration that only works as superuser fails here too (PR #26).
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createSupabasePglite,
  listMigrations,
  MIGRATION_ROLE,
  type SupabasePglite,
} from "../supabase-pglite";

const LOAD_PGVECTOR = "select '[0]'::extensions.vector;";
const KNOWLEDGE_CHAT = "20261127090714_knowledge_chat.sql";

/** A migrations dir with copies of the real migrations, plus `extra` files. */
async function migrationsDir(
  extra: Record<string, string> = {},
  edit: (name: string, sql: string) => string = (_n, sql) => sql,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "askwell-migrations-"));
  for (const file of await listMigrations()) {
    const name = basename(file);
    await writeFile(join(dir, name), edit(name, await readFile(file, "utf8")));
  }
  for (const [name, sql] of Object.entries(extra)) {
    await writeFile(join(dir, name), sql);
  }
  return dir;
}

/** The `Migration failed: <file>` error and its Postgres cause. */
async function failure(dir: string): Promise<{ file: string; cause: string }> {
  try {
    const sb = await createSupabasePglite({ migrationsDir: dir });
    await sb.close();
  } catch (error) {
    const e = error as Error & { cause?: Error };
    return { file: e.message, cause: e.cause?.message ?? "" };
  }
  throw new Error("expected the migrations to fail");
}

const dirs: string[] = [];
const tracked = async (dir: Promise<string>) => {
  const d = await dir;
  dirs.push(d);
  return d;
};

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("migrations run as Supabase's non-superuser postgres", () => {
  let sb: SupabasePglite;

  beforeAll(async () => {
    sb = await createSupabasePglite();
  });

  afterAll(async () => {
    await sb.close();
  });

  it("the migration role is not a superuser", async () => {
    const { rows } = await sb.db.query<Record<string, boolean>>(
      "select rolsuper, rolcreaterole, rolbypassrls from pg_roles where rolname = $1",
      [MIGRATION_ROLE],
    );
    expect(rows).toEqual([
      { rolsuper: false, rolcreaterole: true, rolbypassrls: true },
    ]);
  });

  it("owns every table and function the migrations created", async () => {
    const { rows } = await sb.db.query<{ name: string; owner: string }>(
      `select c.relname as name, pg_get_userbyid(c.relowner) as owner
         from pg_class c
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       union all
       select p.proname, pg_get_userbyid(p.proowner)
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => r.owner !== MIGRATION_ROLE)).toEqual([]);
  });
});

describe("a migration that needs superuser fails", () => {
  it("catches PR #26: setting hnsw.iterative_scan before pgvector is loaded", async () => {
    // knowledge_chat as PR #26 merged it, before the fix in PR #28.
    const dir = await tracked(
      migrationsDir({}, (name, sql) => {
        if (name !== KNOWLEDGE_CHAT) return sql;
        expect(sql).toContain(LOAD_PGVECTOR);
        return sql.replace(LOAD_PGVECTOR, "");
      }),
    );
    const { file, cause } = await failure(dir);
    expect(file).toContain(KNOWLEDGE_CHAT);
    expect(cause).toBe('permission denied to set parameter "hnsw.iterative_scan"');
  });

  it("fails even when an earlier migration loaded pgvector (fresh session per migration)", async () => {
    // initial_schema builds an HNSW index, which loads pgvector in its session.
    const dir = await tracked(
      migrationsDir({
        "29990101000000_iterative_scan.sql": `
          create function public.probe() returns int
          language sql
          set hnsw.iterative_scan = strict_order
          as $$ select 1 $$;`,
      }),
    );
    const { file, cause } = await failure(dir);
    expect(file).toContain("29990101000000_iterative_scan.sql");
    expect(cause).toBe('permission denied to set parameter "hnsw.iterative_scan"');
  });

  it("passes once the migration loads pgvector first", async () => {
    const dir = await tracked(
      migrationsDir({
        "29990101000000_iterative_scan.sql": `
          ${LOAD_PGVECTOR}
          create function public.probe() returns int
          language sql
          set hnsw.iterative_scan = strict_order
          as $$ select 1 $$;`,
      }),
    );
    const sb = await createSupabasePglite({ migrationsDir: dir });
    const { rows } = await sb.db.query<{ proconfig: string[] }>(
      "select proconfig from pg_proc where oid = 'public.probe()'::regprocedure",
    );
    expect(rows[0]!.proconfig).toEqual(["hnsw.iterative_scan=strict_order"]);
    await sb.close();
  });

  it("refuses other superuser-only statements", async () => {
    const dir = await tracked(
      migrationsDir({
        "29990101000000_superuser.sql": "alter role authenticated superuser;",
      }),
    );
    const { cause } = await failure(dir);
    expect(cause).toMatch(/permission denied/);
  });
});

// The copies above include every real migration, so check none was missed.
it("copies every real migration", async () => {
  const dir = await tracked(migrationsDir());
  const copied = (await listMigrations(dir)).map((f) => basename(f));
  const real = (await listMigrations()).map((f) => basename(f));
  expect(copied).toEqual(real);
});
