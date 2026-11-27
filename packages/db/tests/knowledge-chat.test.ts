import {
  ALLOWED_KNOWLEDGE_MIME_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
  PLAN_LIMITS,
} from "@askwell/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { count, ids, seedAB } from "./fixtures";

let sb: SupabasePglite;

beforeAll(async () => {
  sb = await createSupabasePglite();
  await seedAB(sb);
});

afterAll(async () => {
  await sb.close();
});

const service = () => sb.asRole("service_role");

/** A 1536-dim vector pointing mostly along axis `i` (cosine-distinct per axis). */
const axis = (i: number, lean = 0) => {
  const v = Array<number>(1536).fill(0);
  v[i] = 1;
  if (lean) v[(i + 1) % 1536] = lean;
  return `[${v.join(",")}]`;
};

const FUNCTIONS = [
  "public.reserve_knowledge_source(uuid, text, text, text, text, integer)",
  "public.match_chunks(uuid, extensions.vector, integer)",
  "public.consume_message(uuid, integer)",
  "public.save_chat_turn(uuid, text, uuid, text, text)",
] as const;

// ---------------------------------------------------------------------------

describe("knowledge bucket", () => {
  it("is private with the shared size and type limits, and no object policies", async () => {
    const { rows } = await sb.db.query<{
      public: boolean;
      file_size_limit: number;
      allowed_mime_types: string[];
    }>(
      "select public, file_size_limit::int as file_size_limit, allowed_mime_types from storage.buckets where id = 'knowledge'",
    );
    expect(rows).toEqual([
      {
        public: false,
        file_size_limit: MAX_KNOWLEDGE_FILE_BYTES,
        allowed_mime_types: [...ALLOWED_KNOWLEDGE_MIME_TYPES],
      },
    ]);

    const policies = await sb.db.query(
      "select 1 from pg_policies where schemaname = 'storage'",
    );
    expect(policies.rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

interface SourceRow {
  id: string;
  project_id: string;
  title: string;
  type: string;
  storage_key: string | null;
  status: string;
}

const RESERVE =
  "select * from public.reserve_knowledge_source($1, $2, $3, $4, $5, $6)";

const PROJECT_R = "cccccccc-0000-4000-8000-000000000001";

describe("reserve_knowledge_source", () => {
  const limit = PLAN_LIMITS.free.knowledgeSources;
  const reserve = (
    title: string,
    type: string,
    key: string | null,
    status: string,
    max: number | null = limit,
    project = PROJECT_R,
  ) =>
    service().query<SourceRow>(RESERVE, [project, title, type, key, status, max]);

  beforeAll(async () => {
    await sb.db.query(
      "insert into public.projects (id, owner_id, name, public_key) values ($1, 'user_a', 'Reserve', 'pk_rrrrrrrrrrrrrrrrrrrr')",
      [PROJECT_R],
    );
  });

  beforeEach(async () => {
    await sb.db.query("delete from public.knowledge_sources where project_id = $1", [
      PROJECT_R,
    ]);
  });

  it("inserts pasted text as processing and files as uploading", async () => {
    const text = await reserve("FAQ", "text", null, "processing");
    expect(text.rows[0]).toMatchObject({
      project_id: PROJECT_R,
      title: "FAQ",
      type: "text",
      storage_key: null,
      status: "processing",
    });
    const file = await reserve("Guide", "pdf", `${PROJECT_R}/a.pdf`, "uploading");
    expect(file.rows[0]).toMatchObject({
      type: "pdf",
      storage_key: `${PROJECT_R}/a.pdf`,
      status: "uploading",
    });
  });

  it("refuses a status that doesn't fit the type", async () => {
    for (const [type, key, status] of [
      ["text", null, "uploading"],
      ["pdf", "k.pdf", "processing"],
      ["md", "k.md", "ready"],
    ] as const) {
      await expect(reserve("X", type, key, status)).rejects.toMatchObject({
        code: "22023",
        message: "invalid_status",
      });
    }
    expect(await count(sb, "knowledge_sources", `project_id = '${PROJECT_R}'`)).toBe(0);
  });

  it("refuses at the limit with plan_limit_reached and writes nothing", async () => {
    for (let i = 0; i < limit; i++) {
      await reserve(`S${i}`, "txt", `${PROJECT_R}/${i}.txt`, "uploading");
    }
    await expect(reserve("One more", "text", null, "processing")).rejects.toMatchObject({
      code: "P0001",
      message: "plan_limit_reached",
    });
    expect(await count(sb, "knowledge_sources", `project_id = '${PROJECT_R}'`)).toBe(limit);

    // A higher limit (Pro, read on the server) lets it through.
    const pro = await reserve(
      "One more",
      "text",
      null,
      "processing",
      PLAN_LIMITS.pro.knowledgeSources,
    );
    expect(pro.rows).toHaveLength(1);
  });

  it("counts only the project's own sources", async () => {
    // Project A already has a source; it doesn't count against PROJECT_R.
    for (let i = 0; i < limit; i++) {
      await reserve(`S${i}`, "text", null, "processing");
    }
    expect(await count(sb, "knowledge_sources", `project_id = '${PROJECT_R}'`)).toBe(limit);
  });

  it("reclaims uploading reservations older than 2 hours, and only those", async () => {
    for (let i = 0; i < limit; i++) {
      await reserve(`S${i}`, "pdf", `${PROJECT_R}/${i}.pdf`, "uploading");
    }
    // S0: stale upload. S1: stale but finalized (processing). S2: fresh upload.
    await sb.db.query(
      `update public.knowledge_sources set created_at = now() - interval '2 hours 1 minute'
       where project_id = $1 and title in ('S0', 'S1')`,
      [PROJECT_R],
    );
    await sb.db.query(
      "update public.knowledge_sources set status = 'processing' where project_id = $1 and title = 'S1'",
      [PROJECT_R],
    );
    // A stale upload in another project is left alone.
    await sb.db.query(
      `insert into public.knowledge_sources (project_id, title, type, storage_key, status, created_at)
       values ($1, 'Other stale', 'pdf', 'other/stale.pdf', 'uploading', now() - interval '3 hours')`,
      [ids.projectB],
    );

    const { rows } = await reserve("New", "text", null, "processing");
    expect(rows).toHaveLength(1);

    const left = await sb.db.query<{ title: string }>(
      "select title from public.knowledge_sources where project_id = $1 order by title",
      [PROJECT_R],
    );
    expect(left.rows.map((r) => r.title)).toEqual(["New", "S1", "S2"]);
    expect(
      await count(sb, "knowledge_sources", "storage_key = 'other/stale.pdf'"),
    ).toBe(1);
  });

  it("keeps an uploading reservation younger than 2 hours", async () => {
    for (let i = 0; i < limit; i++) {
      await reserve(`S${i}`, "md", `${PROJECT_R}/${i}.md`, "uploading");
    }
    await sb.db.query(
      "update public.knowledge_sources set created_at = now() - interval '1 hour 59 minutes' where project_id = $1",
      [PROJECT_R],
    );
    await expect(reserve("New", "text", null, "processing")).rejects.toMatchObject({
      message: "plan_limit_reached",
    });
  });

  it("refuses concurrent reservations past the limit", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: limit + 3 }, (_, i) =>
        reserve(`C${i}`, "text", null, "processing"),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(limit);
    expect(await count(sb, "knowledge_sources", `project_id = '${PROJECT_R}'`)).toBe(limit);
  });

  it("raises not_found for an unknown project", async () => {
    await expect(
      reserve("X", "text", null, "processing", limit, "dddddddd-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({ code: "P0002", message: "not_found" });
  });

  it("rejects a null or negative limit", async () => {
    for (const max of [null, -1]) {
      await expect(reserve("X", "text", null, "processing", max)).rejects.toMatchObject({
        code: "22023",
        message: "invalid_limit",
      });
    }
  });

  it("rejects a title outside 1..200 chars via the table check", async () => {
    await expect(reserve("", "text", null, "processing")).rejects.toMatchObject({
      code: "23514",
    });
  });
});

// ---------------------------------------------------------------------------

interface MatchRow {
  id: string;
  source_id: string;
  content: string;
  similarity: number;
}

const MATCH = "select * from public.match_chunks($1, $2::extensions.vector, $3)";

describe("match_chunks", () => {
  const P = "eeeeeeee-0000-4000-8000-000000000001";
  const ready = "eeeeeeee-0000-4000-8000-000000000002";
  const processing = "eeeeeeee-0000-4000-8000-000000000003";
  const failed = "eeeeeeee-0000-4000-8000-000000000004";

  beforeAll(async () => {
    await sb.db.query(
      "insert into public.projects (id, owner_id, name, public_key) values ($1, 'user_b', 'Match', 'pk_mmmmmmmmmmmmmmmmmmmm')",
      [P],
    );
    await sb.db.query(
      `insert into public.knowledge_sources (id, project_id, title, type, storage_key, status) values
        ($2, $1, 'Ready', 'text', null, 'ready'),
        ($3, $1, 'Processing', 'text', null, 'processing'),
        ($4, $1, 'Failed', 'text', null, 'failed')`,
      [P, ready, processing, failed],
    );
    // Ready chunks along axes 0..6, plus not-ready chunks exactly on the query
    // axis, plus another project's chunk exactly on the query axis.
    for (let i = 0; i < 7; i++) {
      await sb.db.query(
        "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)",
        [P, ready, `ready-${i}`, axis(0, i * 0.5)],
      );
    }
    for (const [src, name] of [
      [processing, "processing"],
      [failed, "failed"],
    ] as const) {
      await sb.db.query(
        "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)",
        [P, src, name, axis(0)],
      );
    }
    await sb.db.query(
      "update public.knowledge_chunks set embedding = $2 where project_id = $1",
      [ids.projectA, axis(0)],
    );
  });

  it("returns the top 5 by cosine similarity, from this project's ready sources only", async () => {
    const { rows } = await service().query<MatchRow>(MATCH, [P, axis(0), 5]);
    expect(rows.map((r) => r.content)).toEqual([
      "ready-0",
      "ready-1",
      "ready-2",
      "ready-3",
      "ready-4",
    ]);
    expect(rows.every((r) => r.source_id === ready)).toBe(true);
    expect(rows[0]!.similarity).toBeCloseTo(1, 5);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]!.similarity).toBeLessThan(rows[i - 1]!.similarity);
    }
  });

  it("defaults to 5 and honours p_count", async () => {
    const byDefault = await service().query<MatchRow>(
      "select * from public.match_chunks($1, $2::extensions.vector)",
      [P, axis(0)],
    );
    expect(byDefault.rows).toHaveLength(5);
    const two = await service().query<MatchRow>(MATCH, [P, axis(0), 2]);
    expect(two.rows).toHaveLength(2);
  });

  it("never returns another project's chunks", async () => {
    const a = await service().query<MatchRow>(MATCH, [ids.projectA, axis(0), 50]);
    expect(a.rows.map((r) => r.source_id)).toEqual([ids.sourceA]);
    const b = await service().query<MatchRow>(MATCH, [P, axis(0), 50]);
    expect(b.rows).toHaveLength(7);
    expect(b.rows.every((r) => r.source_id === ready)).toBe(true);
  });

  it("returns nothing for a project without ready chunks", async () => {
    const { rows } = await service().query<MatchRow>(MATCH, [
      "dddddddd-0000-4000-8000-000000000001",
      axis(0),
      5,
    ]);
    expect(rows).toEqual([]);
  });

  it("rejects an embedding that isn't 1536-dim", async () => {
    await expect(
      service().query(MATCH, [P, "[1,0,0]", 5]),
    ).rejects.toThrow(/different vector dimensions/);
  });
});

// ---------------------------------------------------------------------------

const CONSUME = "select * from public.consume_message($1, $2)";
type ConsumeRow = { allowed: boolean; messages_used: number };

describe("consume_message", () => {
  const P = "ffffffff-0000-4000-8000-000000000001";
  const limit = PLAN_LIMITS.free.messagesPerMonth;
  const consume = (max: number | null = limit, project = P) =>
    service().query<ConsumeRow>(CONSUME, [project, max]);
  const state = async () =>
    (
      await sb.db.query<{ messages_used: number; current: boolean }>(
        `select messages_used, period_start = date_trunc('month', now(), 'UTC') as current
         from public.projects where id = $1`,
        [P],
      )
    ).rows[0]!;

  beforeAll(async () => {
    await sb.db.query(
      "insert into public.projects (id, owner_id, name, public_key) values ($1, 'user_a', 'Quota', 'pk_qqqqqqqqqqqqqqqqqqqq')",
      [P],
    );
  });

  beforeEach(async () => {
    await sb.db.query(
      "update public.projects set messages_used = 0, period_start = date_trunc('month', now(), 'UTC') where id = $1",
      [P],
    );
  });

  it("counts each message and returns the new count", async () => {
    expect((await consume()).rows).toEqual([{ allowed: true, messages_used: 1 }]);
    expect((await consume()).rows).toEqual([{ allowed: true, messages_used: 2 }]);
    expect((await state()).messages_used).toBe(2);
  });

  it("refuses at the limit without counting", async () => {
    await sb.db.query("update public.projects set messages_used = $2 where id = $1", [
      P,
      limit - 1,
    ]);
    expect((await consume()).rows).toEqual([{ allowed: true, messages_used: limit }]);
    expect((await consume()).rows).toEqual([{ allowed: false, messages_used: limit }]);
    expect((await state()).messages_used).toBe(limit);
  });

  it("lets only one of many concurrent calls take the last slot", async () => {
    await sb.db.query("update public.projects set messages_used = $2 where id = $1", [
      P,
      limit - 1,
    ]);
    const results = await Promise.all(Array.from({ length: 10 }, () => consume()));
    const allowed = results.filter((r) => r.rows[0]!.allowed);
    expect(allowed).toHaveLength(1);
    expect((await state()).messages_used).toBe(limit);
  });

  it("resets when the month rolled over, then counts", async () => {
    await sb.db.query(
      `update public.projects set messages_used = $2,
         period_start = date_trunc('month', now(), 'UTC') - interval '1 month'
       where id = $1`,
      [P, limit],
    );
    expect((await consume()).rows).toEqual([{ allowed: true, messages_used: 1 }]);
    expect(await state()).toEqual({ messages_used: 1, current: true });
  });

  it("only touches the given project", async () => {
    const before = await sb.db.query<{ messages_used: number }>(
      "select messages_used from public.projects where id = $1",
      [ids.projectB],
    );
    await consume();
    const after = await sb.db.query<{ messages_used: number }>(
      "select messages_used from public.projects where id = $1",
      [ids.projectB],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("raises not_found for an unknown project", async () => {
    await expect(
      consume(limit, "dddddddd-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({ code: "P0002", message: "not_found" });
  });

  it("rejects a null or negative limit", async () => {
    for (const max of [null, -1]) {
      await expect(consume(max)).rejects.toMatchObject({
        code: "22023",
        message: "invalid_limit",
      });
    }
  });
});

// ---------------------------------------------------------------------------

const SAVE = "select public.save_chat_turn($1, $2, $3, $4, $5) as id";

describe("save_chat_turn", () => {
  const save = (project: string, conversation: string | null) =>
    service().query<{ id: string }>(SAVE, [
      project,
      "visitor-9",
      conversation,
      "Do you ship to Canada?",
      "Yes, we ship worldwide.",
    ]);
  const thread = (conversation: string) =>
    sb.db.query<{ role: string; body: string }>(
      "select role, body from public.messages where conversation_id = $1 order by created_at",
      [conversation],
    );

  it("creates the conversation on the first message and stores both messages in order", async () => {
    const { rows } = await save(ids.projectA, null);
    const id = rows[0]!.id;
    const conv = await sb.db.query(
      "select project_id, visitor_id from public.conversations where id = $1",
      [id],
    );
    expect(conv.rows).toEqual([{ project_id: ids.projectA, visitor_id: "visitor-9" }]);
    expect((await thread(id)).rows).toEqual([
      { role: "visitor", body: "Do you ship to Canada?" },
      { role: "bot", body: "Yes, we ship worldwide." },
    ]);
  });

  it("appends to an existing conversation of the project", async () => {
    const before = await count(sb, "conversations");
    const { rows } = await save(ids.projectA, ids.conversationA);
    expect(rows[0]!.id).toBe(ids.conversationA);
    expect(await count(sb, "conversations")).toBe(before);
    const t = (await thread(ids.conversationA)).rows.map((r) => r.role);
    expect(t).toEqual(["visitor", "bot", "visitor", "bot"]);
  });

  it("raises not_found for another project's conversation and writes nothing", async () => {
    const messages = await count(sb, "messages");
    const conversations = await count(sb, "conversations");
    await expect(save(ids.projectA, ids.conversationB)).rejects.toMatchObject({
      code: "P0002",
      message: "not_found",
    });
    await expect(
      save(ids.projectA, "dddddddd-0000-4000-8000-000000000009"),
    ).rejects.toMatchObject({ code: "P0002", message: "not_found" });
    expect(await count(sb, "messages")).toBe(messages);
    expect(await count(sb, "conversations")).toBe(conversations);
  });
});

// ---------------------------------------------------------------------------

describe("grants", () => {
  const calls: Record<(typeof FUNCTIONS)[number], [string, unknown[]]> = {
    [FUNCTIONS[0]]: [RESERVE, [ids.projectA, "X", "text", null, "processing", 100]],
    [FUNCTIONS[1]]: [MATCH, [ids.projectA, axis(0), 5]],
    [FUNCTIONS[2]]: [CONSUME, [ids.projectA, 100]],
    [FUNCTIONS[3]]: [SAVE, [ids.projectA, "v", null, "a", "b"]],
  };

  for (const fn of FUNCTIONS) {
    const name = fn.slice("public.".length, fn.indexOf("("));
    it.each(["anon", "authenticated"] as const)(`%s cannot execute ${name}`, async (role) => {
      const [sql, params] = calls[fn];
      await expect(
        sb.asRole(role, { sub: "user_a" }).query(sql, params),
      ).rejects.toThrow(new RegExp(`permission denied for function ${name}`));
    });

    it(`${name} is SECURITY INVOKER with an empty search_path, executable only by service_role`, async () => {
      const { rows } = await sb.db.query(
        `select p.prosecdef, p.proconfig,
           has_function_privilege('anon', p.oid, 'execute') as anon,
           has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
           has_function_privilege('service_role', p.oid, 'execute') as service_role,
           exists (
             select 1 from aclexplode(p.proacl) a
             where a.grantee = 0 and a.privilege_type = 'EXECUTE'
           ) as public
         from pg_proc p where p.oid = $1::regprocedure`,
        [fn],
      );
      expect(rows[0]).toEqual({
        prosecdef: false,
        proconfig: ['search_path=""'],
        anon: false,
        authenticated: false,
        service_role: true,
        public: false,
      });
    });
  }
});
