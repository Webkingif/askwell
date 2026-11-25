import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import {
  A,
  ALL_TABLES,
  B,
  OWNED_TABLES,
  count,
  embedding,
  ids,
  seedAB,
  seedOwner,
} from "./fixtures";

let sb: SupabasePglite;

beforeAll(async () => {
  sb = await createSupabasePglite();
  await seedAB(sb);
});

afterAll(async () => {
  await sb.close();
});

const owner = (sub: string) => sb.asRole("authenticated", { sub });

// A minimal valid row per table, used to prove INSERT is refused.
const insertSql: Record<(typeof ALL_TABLES)[number], string> = {
  accounts: "insert into public.accounts (clerk_user_id) values ('user_new')",
  projects: `insert into public.projects (owner_id, name, public_key) values ('${A}', 'X', 'pk_xxxxxxxxxxxxxxxxxxxx')`,
  widget_configs: `insert into public.widget_configs (project_id) values ('${ids.projectA}')`,
  knowledge_sources: `insert into public.knowledge_sources (project_id, title, type, status) values ('${ids.projectA}', 'T', 'text', 'ready')`,
  knowledge_chunks: `insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ('${ids.projectA}', '${ids.sourceA}', 'c', '${embedding()}')`,
  conversations: `insert into public.conversations (project_id, visitor_id) values ('${ids.projectA}', 'v')`,
  messages: `insert into public.messages (conversation_id, role, body) values ('${ids.conversationA}', 'visitor', 'x')`,
};

describe("anon", () => {
  it.each(ALL_TABLES)("cannot read %s", async (table) => {
    await expect(
      sb.asRole("anon").query(`select * from public.${table}`),
    ).rejects.toThrow(/permission denied/);
  });

  it.each(ALL_TABLES)("cannot insert into %s", async (table) => {
    await expect(sb.asRole("anon").query(insertSql[table])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot update or delete projects", async () => {
    await expect(
      sb.asRole("anon").query("update public.projects set name = 'x'"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sb.asRole("anon").query("delete from public.projects"),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot run the RLS helpers", async () => {
    for (const fn of ["owned_project_ids", "owned_conversation_ids"]) {
      await expect(
        sb.asRole("anon").query(`select public.${fn}()`),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe("authenticated owner: reads", () => {
  it("A sees only A's account", async () => {
    const r = await owner(A).query<{ clerk_user_id: string }>(
      "select clerk_user_id from public.accounts",
    );
    expect(r.rows.map((x) => x.clerk_user_id)).toEqual([A]);
  });

  it.each([
    [A, ids.projectA],
    [B, ids.projectB],
  ])("%s sees only their own project", async (sub, project) => {
    const r = await owner(sub).query<{ id: string }>(
      "select id from public.projects",
    );
    expect(r.rows.map((x) => x.id)).toEqual([project]);
  });

  it.each([
    "widget_configs",
    "knowledge_sources",
    "knowledge_chunks",
    "conversations",
  ])("A sees only A's rows in %s", async (table) => {
    const r = await owner(A).query<{ project_id: string }>(
      `select project_id from public.${table}`,
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows.every((x) => x.project_id === ids.projectA)).toBe(true);
  });

  it("A sees only the messages of A's conversations", async () => {
    const r = await owner(A).query<{ conversation_id: string }>(
      "select conversation_id from public.messages",
    );
    expect(r.rows.length).toBe(2);
    expect(r.rows.every((x) => x.conversation_id === ids.conversationA)).toBe(
      true,
    );
  });

  it("A cannot read B's rows even by id", async () => {
    const r = await owner(A).query(
      "select 1 from public.messages where conversation_id = $1",
      [ids.conversationB],
    );
    expect(r.rows).toEqual([]);
  });

  it.each(ALL_TABLES)(
    "a token with no sub sees nothing in %s",
    async (table) => {
      const r = await sb
        .asRole("authenticated")
        .query(`select * from public.${table}`);
      expect(r.rows).toEqual([]);
    },
  );

  it("an unknown user sees nothing", async () => {
    for (const table of ALL_TABLES) {
      const r = await owner("user_nobody").query(
        `select * from public.${table}`,
      );
      expect(r.rows).toEqual([]);
    }
  });
});

describe("authenticated owner: writes", () => {
  it.each(ALL_TABLES)("cannot insert into %s", async (table) => {
    await expect(owner(A).query(insertSql[table])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("can rename their own project", async () => {
    const r = await owner(A).query(
      "update public.projects set name = 'Renamed' where id = $1",
      [ids.projectA],
    );
    expect(r.affectedRows).toBe(1);
    expect(await count(sb, "projects", "name = 'Renamed'")).toBe(1);
  });

  it.each([
    ["public_key", "'pk_zzzzzzzzzzzzzzzzzzzz'"],
    ["messages_used", "0"],
    ["period_start", "now()"],
    ["owner_id", `'${B}'`],
  ])("cannot update %s", async (column, value) => {
    await expect(
      owner(A).query(`update public.projects set ${column} = ${value}`),
    ).rejects.toThrow(/permission denied/);
  });

  it.each([
    ["accounts", "plan = 'pro'"],
    ["widget_configs", "show_badge = false"],
    ["knowledge_sources", "status = 'ready'"],
    ["knowledge_chunks", "content = 'x'"],
    ["conversations", "visitor_id = 'x'"],
    ["messages", "body = 'x'"],
  ])("cannot update %s", async (table, set) => {
    await expect(
      owner(A).query(`update public.${table} set ${set}`),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot rename B's project", async () => {
    const r = await owner(A).query(
      "update public.projects set name = 'Hacked' where id = $1",
      [ids.projectB],
    );
    expect(r.affectedRows).toBe(0);
    expect(await count(sb, "projects", "name = 'Hacked'")).toBe(0);
  });

  it("cannot delete B's project", async () => {
    const r = await owner(A).query(
      "delete from public.projects where id = $1",
      [ids.projectB],
    );
    expect(r.affectedRows).toBe(0);
    expect(await count(sb, "projects", `id = '${ids.projectB}'`)).toBe(1);
  });

  it.each(OWNED_TABLES.filter((t) => t !== "projects"))(
    "cannot delete from %s",
    async (table) => {
      await expect(
        owner(A).query(`delete from public.${table}`),
      ).rejects.toThrow(/permission denied/);
    },
  );

  it("cannot truncate", async () => {
    await expect(
      owner(A).query("truncate public.projects cascade"),
    ).rejects.toThrow(/permission denied/);
  });

  it("deleting their own project cascades to every child row", async () => {
    const p = {
      project: "cccccccc-0000-4000-8000-000000000001",
      source: "cccccccc-0000-4000-8000-000000000002",
      conversation: "cccccccc-0000-4000-8000-000000000003",
      key: "pk_cccccccccccccccccccc",
    };
    await seedOwner(sb, A, p);
    const r = await owner(A).query(
      "delete from public.projects where id = $1",
      [p.project],
    );
    expect(r.affectedRows).toBe(1);
    for (const table of OWNED_TABLES) {
      const where =
        table === "projects"
          ? `id = '${p.project}'`
          : table === "messages"
            ? `conversation_id = '${p.conversation}'`
            : `project_id = '${p.project}'`;
      expect(await count(sb, table, where)).toBe(0);
    }
    // Other projects are untouched.
    expect(await count(sb, "messages")).toBe(4);
  });
});

describe("service_role", () => {
  it.each(ALL_TABLES)("reads every row of %s", async (table) => {
    const r = await sb
      .asRole("service_role")
      .query(`select * from public.${table}`);
    expect(r.rows.length).toBe(await count(sb, table));
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it("inserts, updates and deletes", async () => {
    const svc = sb.asRole("service_role");
    await svc.query(
      "insert into public.accounts (clerk_user_id, plan) values ('user_svc', 'pro')",
    );
    const u = await svc.query(
      "update public.projects set messages_used = messages_used + 1 where id = $1",
      [ids.projectB],
    );
    expect(u.affectedRows).toBe(1);
    const d = await svc.query(
      "delete from public.accounts where clerk_user_id = 'user_svc'",
    );
    expect(d.affectedRows).toBe(1);
  });

  it("cannot truncate", async () => {
    await expect(
      sb.asRole("service_role").query("truncate public.messages"),
    ).rejects.toThrow(/permission denied/);
  });
});
