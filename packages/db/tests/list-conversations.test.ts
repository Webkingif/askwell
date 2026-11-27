// list_conversations (migration 20261127144142): the Conversations list, read
// by owners through the owner client (project.md §6.7, §9).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { A, B, ids, seedAB } from "./fixtures";

let sb: SupabasePglite;

// Extra projects of owner A: one for ordering and previews, one for the limit.
const ORDER_PROJECT = "aaaaaaaa-0000-4000-8000-0000000000a1";
const LIMIT_PROJECT = "aaaaaaaa-0000-4000-8000-0000000000a2";
const LIMIT_ROWS = 55;

const conv = (n: number) => `cccccccc-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (minute: number) => new Date(Date.UTC(2026, 10, 27, 12, minute)).toISOString();

const LONG = "x".repeat(119) + "€" + "y".repeat(80); // 200 chars; char 120 is multibyte

interface Row {
  id: string;
  visitor_id: string;
  preview: string;
  message_count: number;
  created_at: Date;
  last_message_at: Date;
}

const LIST = "select * from public.list_conversations($1, $2)";
const LIST_DEFAULT = "select * from public.list_conversations($1)";

const list = (owner: string, project: string, limit?: number | null) =>
  sb
    .asRole("authenticated", { sub: owner })
    .query<Row>(
      limit === undefined ? LIST_DEFAULT : LIST,
      limit === undefined ? [project] : [project, limit],
    );

beforeAll(async () => {
  sb = await createSupabasePglite();
  await seedAB(sb);

  await sb.asRole("service_role").transaction(async (tx) => {
    await tx.query(
      `insert into public.projects (id, owner_id, name, public_key) values
         ($1, $3, 'Order', 'pk_aaaaaaaaaaaaaaaaaaa1'),
         ($2, $3, 'Limit', 'pk_aaaaaaaaaaaaaaaaaaa2')`,
      [ORDER_PROJECT, LIMIT_PROJECT, A],
    );

    // Ordering project:
    //   conv(1): created 0, messages at 1 (bot), 2 (visitor LONG), 3 (visitor) -> last 3
    //   conv(2): created 0, messages at 5                                       -> last 5
    //   conv(3): created 4, no messages                                         -> last 4
    //   conv(4), conv(5): last message at 6 (tie -> id desc: 5 then 4)
    const convs: [number, number][] = [
      [1, 0],
      [2, 0],
      [3, 4],
      [4, 0],
      [5, 0],
    ];
    for (const [n, created] of convs) {
      await tx.query(
        "insert into public.conversations (id, project_id, visitor_id, created_at) values ($1, $2, $3, $4)",
        [conv(n), ORDER_PROJECT, `visitor-${n}`, at(created)],
      );
    }
    const msgs: [number, "visitor" | "bot", string, number][] = [
      [1, "bot", "Bot spoke first", 1],
      [1, "visitor", LONG, 2],
      [1, "visitor", "Second question", 3],
      [2, "visitor", "Short", 5],
      [4, "visitor", "Four", 6],
      [5, "visitor", "Five", 6],
    ];
    for (const [n, role, body, minute] of msgs) {
      await tx.query(
        "insert into public.messages (conversation_id, role, body, created_at) values ($1, $2, $3, $4)",
        [conv(n), role, body, at(minute)],
      );
    }

    await tx.query(
      `insert into public.conversations (project_id, visitor_id)
       select $1, 'v-' || g from generate_series(1, $2::int) g`,
      [LIMIT_PROJECT, LIMIT_ROWS],
    );
  });
});

afterAll(async () => {
  await sb.close();
});

describe("list_conversations", () => {
  it("returns the owner's conversations with preview, count and times", async () => {
    const { rows } = await list(A, ids.projectA);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r).toMatchObject({
      id: ids.conversationA,
      visitor_id: "visitor-1",
      preview: "Hi",
      message_count: 2,
    });
    expect(r.created_at).toBeInstanceOf(Date);
    expect(r.last_message_at.getTime()).toBeGreaterThanOrEqual(r.created_at.getTime());
  });

  it("returns zero rows for another owner's project", async () => {
    expect((await list(A, ids.projectB)).rows).toEqual([]);
    expect((await list(B, ids.projectA)).rows).toEqual([]);
    expect((await list(B, ORDER_PROJECT)).rows).toEqual([]);
    // B still sees their own.
    expect((await list(B, ids.projectB)).rows.map((r) => r.id)).toEqual([
      ids.conversationB,
    ]);
  });

  it("returns zero rows without a Clerk user", async () => {
    const { rows } = await sb
      .asRole("authenticated")
      .query<Row>(LIST_DEFAULT, [ids.projectA]);
    expect(rows).toEqual([]);
  });

  it("orders newest first by last_message_at, then id", async () => {
    const { rows } = await list(A, ORDER_PROJECT);
    expect(rows.map((r) => r.id)).toEqual([conv(5), conv(4), conv(2), conv(3), conv(1)]);
    expect(rows.map((r) => r.last_message_at.toISOString())).toEqual([
      at(6),
      at(6),
      at(5),
      at(4), // no messages: the conversation's created_at
      at(3),
    ]);
  });

  it("previews the first visitor message, cut to 120 characters", async () => {
    const byId = new Map((await list(A, ORDER_PROJECT)).rows.map((r) => [r.id, r]));
    const first = byId.get(conv(1))!;
    expect(first.preview).toBe(LONG.slice(0, 120));
    expect([...first.preview]).toHaveLength(120);
    expect(first.preview.endsWith("€")).toBe(true);
    expect(first.message_count).toBe(3);

    expect(byId.get(conv(2))).toMatchObject({ preview: "Short", message_count: 1 });
    expect(byId.get(conv(3))).toMatchObject({ preview: "", message_count: 0 });
  });

  it.each([
    [undefined, 50],
    [null, 50],
    [50, 50],
    [51, 50],
    [1000, 50],
    [3, 3],
    [1, 1],
    [0, 1],
    [-5, 1],
  ])("clamps p_limit %s to %i rows", async (limit, expected) => {
    expect((await list(A, LIMIT_PROJECT, limit)).rows).toHaveLength(expected);
  });
});

describe("list_conversations grants", () => {
  it("is SECURITY INVOKER, stable, search_path = '' and executable only by authenticated", async () => {
    const { rows } = await sb.db.query(
      `select p.prosecdef, p.provolatile, p.proconfig,
         has_function_privilege('anon', p.oid, 'execute') as anon,
         has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
         has_function_privilege('service_role', p.oid, 'execute') as service_role,
         exists (
           select 1 from aclexplode(p.proacl) a
           where a.grantee = 0 and a.privilege_type = 'EXECUTE'
         ) as public
       from pg_proc p where p.oid = 'public.list_conversations(uuid, integer)'::regprocedure`,
    );
    expect(rows[0]).toEqual({
      prosecdef: false,
      provolatile: "s",
      proconfig: ['search_path=""'],
      anon: false,
      authenticated: true,
      service_role: false,
      public: false,
    });
  });

  it.each(["anon", "service_role"] as const)("%s cannot execute it", async (role) => {
    await expect(
      sb.asRole(role, { sub: A }).query(LIST_DEFAULT, [ids.projectA]),
    ).rejects.toThrow(/permission denied for function list_conversations/);
  });
});
