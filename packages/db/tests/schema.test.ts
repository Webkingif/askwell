import {
  DEFAULT_WIDGET_CONFIG,
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MAX_KNOWLEDGE_TITLE_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  MAX_WIDGET_HEADER_LENGTH,
  MAX_WIDGET_LABEL_LENGTH,
  MESSAGE_ROLES,
  PLANS,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { ALL_TABLES, A, embedding, ids, seedAB } from "./fixtures";

let sb: SupabasePglite;

beforeAll(async () => {
  sb = await createSupabasePglite();
  await seedAB(sb);
});

afterAll(async () => {
  await sb.close();
});

/** Run SQL as service_role inside a transaction that always rolls back. */
async function attempt(sql: string, params: unknown[] = []): Promise<void> {
  const rollback = new Error("rollback");
  try {
    await sb.asRole("service_role").transaction(async (tx) => {
      await tx.query(sql, params);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

const ok = (sql: string, params?: unknown[]) =>
  expect(attempt(sql, params)).resolves.toBeUndefined();
const bad = (sql: string, params?: unknown[]) =>
  expect(attempt(sql, params)).rejects.toThrow(/violates/);

describe("tables (project.md §7)", () => {
  it("has exactly the 7 tables, each with RLS on", async () => {
    const r = await sb.db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`,
    );
    expect(r.rows.map((x) => x.relname)).toEqual([...ALL_TABLES].sort());
    expect(r.rows.every((x) => x.relrowsecurity)).toBe(true);
  });

  it("has the §7 columns", async () => {
    const r = await sb.db.query<{ table_name: string; cols: string }>(
      `select table_name, string_agg(column_name, ',' order by ordinal_position) as cols
       from information_schema.columns where table_schema = 'public' group by table_name`,
    );
    expect(
      Object.fromEntries(r.rows.map((x) => [x.table_name, x.cols])),
    ).toEqual({
      accounts: "clerk_user_id,plan,created_at",
      projects:
        "id,owner_id,name,public_key,messages_used,period_start,created_at",
      widget_configs:
        "project_id,button_color,position,label,animation,header_text,show_badge",
      knowledge_sources:
        "id,project_id,title,type,storage_key,status,created_at",
      knowledge_chunks: "id,project_id,source_id,content,embedding",
      conversations: "id,project_id,visitor_id,created_at",
      messages: "id,conversation_id,role,body,created_at",
    });
  });

  it("indexes the embedding with HNSW (cosine)", async () => {
    const r = await sb.db.query<{ indexdef: string }>(
      "select indexdef from pg_indexes where indexname = 'knowledge_chunks_embedding_idx'",
    );
    expect(r.rows[0]?.indexdef).toMatch(/USING hnsw .*vector_cosine_ops/);
  });

  it("indexes every foreign key (leading columns)", async () => {
    const r = await sb.db.query<{ fk: string }>(
      `select c.conname as fk from pg_constraint c
       where c.contype = 'f' and c.connamespace = 'public'::regnamespace
         and not exists (
           select 1 from pg_index i
           where i.indrelid = c.conrelid
             and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey
         )`,
    );
    expect(r.rows).toEqual([]);
  });
});

describe("defaults", () => {
  it("widget_configs defaults equal DEFAULT_WIDGET_CONFIG", async () => {
    const r = await sb.db.query<Record<string, unknown>>(
      "select button_color, position, label, animation, header_text, show_badge from public.widget_configs where project_id = $1",
      [ids.projectA],
    );
    const row = r.rows[0];
    expect(row).toEqual({
      button_color: DEFAULT_WIDGET_CONFIG.buttonColor,
      position: DEFAULT_WIDGET_CONFIG.position,
      label: DEFAULT_WIDGET_CONFIG.label,
      animation: DEFAULT_WIDGET_CONFIG.animation,
      header_text: DEFAULT_WIDGET_CONFIG.headerText,
      show_badge: DEFAULT_WIDGET_CONFIG.showBadge,
    });
  });

  it("new accounts are free; new projects start at 0 in this month", async () => {
    const r = await sb.db.query<{
      plan: string;
      messages_used: number;
      is_month_start: boolean;
    }>(
      `select a.plan, p.messages_used,
              p.period_start = date_trunc('month', now(), 'UTC') as is_month_start
       from public.projects p join public.accounts a on a.clerk_user_id = p.owner_id
       where p.id = $1`,
      [ids.projectA],
    );
    expect(r.rows[0]).toEqual({
      plan: "free",
      messages_used: 0,
      is_month_start: true,
    });
  });
});

describe("check constraints match packages/shared", () => {
  const project = ids.projectA;

  it.each(PLANS)("accepts plan %s", (plan) =>
    ok("insert into public.accounts (clerk_user_id, plan) values ('u', $1)", [
      plan,
    ]),
  );
  it("rejects a bad plan", () =>
    bad(
      "insert into public.accounts (clerk_user_id, plan) values ('u', 'gold')",
    ));

  const setConfig = (set: string) =>
    `update public.widget_configs set ${set} where project_id = '${project}'`;

  it.each(WIDGET_POSITIONS)("accepts position %s", (v) =>
    ok(setConfig("position = $1"), [v]),
  );
  it.each(WIDGET_ANIMATIONS)("accepts animation %s", (v) =>
    ok(setConfig("animation = $1"), [v]),
  );
  it.each([
    ["position", "middle"],
    ["position", "bottom_right"],
    ["animation", "spin"],
    ["button_color", "red"],
    ["button_color", "#12345"],
    ["label", ""],
    ["label", "x".repeat(MAX_WIDGET_LABEL_LENGTH + 1)],
    ["header_text", "x".repeat(MAX_WIDGET_HEADER_LENGTH + 1)],
  ])("rejects widget %s = %j", (column, v) =>
    bad(setConfig(`${column} = $1`), [v]),
  );
  it("accepts max-length label and header", () =>
    ok(setConfig("label = $1, header_text = $2"), [
      "x".repeat(MAX_WIDGET_LABEL_LENGTH),
      "x".repeat(MAX_WIDGET_HEADER_LENGTH),
    ]));

  const insertSource =
    "insert into public.knowledge_sources (project_id, title, type, status, storage_key) values ($1, $2, $3, $4, $5)";

  it.each(KNOWLEDGE_SOURCE_TYPES)("accepts source type %s", (type) =>
    ok(insertSource, [
      project,
      "T",
      type,
      "ready",
      type === "text" ? null : `k/${type}`,
    ]),
  );
  it.each(KNOWLEDGE_SOURCE_STATUSES)("accepts source status %s", (status) =>
    ok(insertSource, [project, "T", "text", status, null]),
  );
  it.each([
    ["a bad type", ["T", "docx", "ready", "k/1"]],
    ["a bad status", ["T", "text", "done", null]],
    ["an empty title", ["", "text", "ready", null]],
    [
      "a long title",
      ["x".repeat(MAX_KNOWLEDGE_TITLE_LENGTH + 1), "text", "ready", null],
    ],
    ["pasted text with a storage key", ["T", "text", "ready", "k/1"]],
    ["a file without a storage key", ["T", "pdf", "uploading", null]],
  ])("rejects a source with %s", (_n, values) =>
    bad(insertSource, [project, ...values]),
  );

  it.each(MESSAGE_ROLES)("accepts message role %s", (role) =>
    ok(
      "insert into public.messages (conversation_id, role, body) values ($1, $2, 'x')",
      [ids.conversationA, role],
    ),
  );
  it("rejects a bad message role", () =>
    bad(
      "insert into public.messages (conversation_id, role, body) values ($1, 'system', 'x')",
      [ids.conversationA],
    ));

  const insertProject =
    "insert into public.projects (owner_id, name, public_key) values ($1, $2, $3)";
  it("accepts a valid project", () =>
    ok(insertProject, [
      A,
      "x".repeat(MAX_PROJECT_NAME_LENGTH),
      "pk_AbC-_0123456789xyz",
    ]));
  it.each([
    ["an empty name", "", "pk_aaaaaaaaaaaaaaaa1234"],
    [
      "a long name",
      "x".repeat(MAX_PROJECT_NAME_LENGTH + 1),
      "pk_aaaaaaaaaaaaaaaa1234",
    ],
    ["a key without pk_", "P", "sk_aaaaaaaaaaaaaaaa1234"],
    ["a short key", "P", "pk_short"],
    ["a key with bad characters", "P", "pk_aaaaaaaa aaaaaaaa!"],
    ["a duplicate key", "P", "pk_aaaaaaaaaaaaaaaaaaaa"],
  ])("rejects a project with %s", (_n, name, key) =>
    bad(insertProject, [A, name, key]),
  );

  it("rejects negative messages_used", () =>
    bad("update public.projects set messages_used = -1 where id = $1", [
      project,
    ]));

  it("rejects a chunk whose project differs from its source's", () =>
    bad(
      "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'c', $3)",
      [ids.projectB, ids.sourceA, embedding()],
    ));

  it("rejects an embedding of the wrong size", () =>
    expect(
      attempt(
        "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'c', '[1,2,3]')",
        [project, ids.sourceA],
      ),
    ).rejects.toThrow(/dimensions/));
});

describe("grants and helpers (project.md §9 Database API)", () => {
  it("anon has no privilege on any table", async () => {
    const r = await sb.db.query(
      "select * from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'PUBLIC')",
    );
    expect(r.rows).toEqual([]);
    const c = await sb.db.query(
      "select * from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'PUBLIC')",
    );
    expect(c.rows).toEqual([]);
  });

  it("no API role can TRUNCATE any table", async () => {
    const r = await sb.db.query(
      "select * from information_schema.role_table_grants where table_schema = 'public' and privilege_type = 'TRUNCATE'" +
        " and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')",
    );
    expect(r.rows).toEqual([]);
  });

  it("authenticated has exactly SELECT everywhere plus UPDATE(name) and DELETE on projects", async () => {
    const t = await sb.db.query<{ table_name: string; p: string }>(
      `select table_name, string_agg(privilege_type, ',' order by privilege_type) as p
       from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated' group by table_name`,
    );
    const expected = Object.fromEntries(
      ALL_TABLES.map((x) => [x, x === "projects" ? "DELETE,SELECT" : "SELECT"]),
    );
    expect(Object.fromEntries(t.rows.map((x) => [x.table_name, x.p]))).toEqual(
      expected,
    );
    const c = await sb.db.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.column_privileges
       where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'UPDATE'`,
    );
    expect(c.rows).toEqual([{ table_name: "projects", column_name: "name" }]);
  });

  it.each(["owned_project_ids", "owned_conversation_ids"])(
    "%s is SECURITY DEFINER, stable, search_path = '' and executable only by authenticated",
    async (fn) => {
      const r = await sb.db.query<{
        prosecdef: boolean;
        provolatile: string;
        proconfig: string[];
        anon: boolean;
        authenticated: boolean;
        service_role: boolean;
        public: boolean;
      }>(
        `select prosecdef, provolatile, proconfig,
           has_function_privilege('anon', oid, 'execute') as anon,
           has_function_privilege('authenticated', oid, 'execute') as authenticated,
           has_function_privilege('service_role', oid, 'execute') as service_role,
           exists (select 1 from aclexplode(proacl) where grantee = 0) as public
         from pg_proc where oid = $1::regprocedure`,
        [`public.${fn}()`],
      );
      expect(r.rows[0]).toEqual({
        prosecdef: true,
        provolatile: "s",
        proconfig: ['search_path=""'],
        anon: false,
        authenticated: true,
        service_role: false,
        public: false,
      });
    },
  );

  it("public has only the expected functions; only the RLS helpers are SECURITY DEFINER", async () => {
    const r = await sb.db.query<{ proname: string; prosecdef: boolean }>(
      "select proname, prosecdef from pg_proc where pronamespace = 'public'::regnamespace order by proname",
    );
    expect(r.rows).toEqual([
      { proname: "consume_message", prosecdef: false },
      { proname: "create_project", prosecdef: false },
      { proname: "list_conversations", prosecdef: false },
      { proname: "match_chunks", prosecdef: false },
      { proname: "owned_conversation_ids", prosecdef: true },
      { proname: "owned_project_ids", prosecdef: true },
      { proname: "reserve_knowledge_source", prosecdef: false },
      { proname: "save_chat_turn", prosecdef: false },
    ]);
  });

  it("owned_project_ids returns the caller's projects only", async () => {
    const r = await sb
      .asRole("authenticated", { sub: A })
      .query<{ id: string }>("select public.owned_project_ids() as id");
    expect(r.rows.map((x) => x.id)).toContain(ids.projectA);
    expect(r.rows.map((x) => x.id)).not.toContain(ids.projectB);
  });
});
