// Two owners (A and B), each with one project and a row in every child table.
import type { SupabasePglite } from "../supabase-pglite";

export const A = "user_a";
export const B = "user_b";

export const ids = {
  projectA: "aaaaaaaa-0000-4000-8000-000000000001",
  projectB: "bbbbbbbb-0000-4000-8000-000000000001",
  sourceA: "aaaaaaaa-0000-4000-8000-000000000002",
  sourceB: "bbbbbbbb-0000-4000-8000-000000000002",
  conversationA: "aaaaaaaa-0000-4000-8000-000000000003",
  conversationB: "bbbbbbbb-0000-4000-8000-000000000003",
} as const;

export const keyA = "pk_aaaaaaaaaaaaaaaaaaaa";
export const keyB = "pk_bbbbbbbbbbbbbbbbbbbb";

/** A 1536-dim embedding literal. */
export const embedding = (x = 0.1) => `[${Array(1536).fill(x).join(",")}]`;

export const OWNED_TABLES = [
  "projects",
  "widget_configs",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
] as const;

export const ALL_TABLES = ["accounts", ...OWNED_TABLES] as const;

/** Insert a full project tree for one owner, as service_role. */
export async function seedOwner(
  sb: SupabasePglite,
  owner: string,
  p: { project: string; source: string; conversation: string; key: string },
): Promise<void> {
  await sb.asRole("service_role").transaction(async (tx) => {
    await tx.query(
      "insert into public.accounts (clerk_user_id) values ($1) on conflict do nothing",
      [owner],
    );
    await tx.query(
      "insert into public.projects (id, owner_id, name, public_key) values ($1, $2, $3, $4)",
      [p.project, owner, `Project of ${owner}`, p.key],
    );
    await tx.query(
      "insert into public.widget_configs (project_id) values ($1)",
      [p.project],
    );
    await tx.query(
      "insert into public.knowledge_sources (id, project_id, title, type, status) values ($1, $2, 'FAQ', 'text', 'ready')",
      [p.source, p.project],
    );
    await tx.query(
      "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'We ship worldwide.', $3)",
      [p.project, p.source, embedding()],
    );
    await tx.query(
      "insert into public.conversations (id, project_id, visitor_id) values ($1, $2, 'visitor-1')",
      [p.conversation, p.project],
    );
    await tx.query(
      "insert into public.messages (conversation_id, role, body) values ($1, 'visitor', 'Hi'), ($1, 'bot', 'Hello!')",
      [p.conversation],
    );
  });
}

export async function seedAB(sb: SupabasePglite): Promise<void> {
  await seedOwner(sb, A, {
    project: ids.projectA,
    source: ids.sourceA,
    conversation: ids.conversationA,
    key: keyA,
  });
  await seedOwner(sb, B, {
    project: ids.projectB,
    source: ids.sourceB,
    conversation: ids.conversationB,
    key: keyB,
  });
}

/** Row count of a table as postgres (ignores RLS). */
export async function count(
  sb: SupabasePglite,
  table: string,
  where = "true",
): Promise<number> {
  const r = await sb.db.query<{ n: number }>(
    `select count(*)::int as n from public.${table} where ${where}`,
  );
  return r.rows[0]?.n ?? 0;
}
