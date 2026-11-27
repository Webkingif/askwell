// In-memory projects, conversations and messages behind a fake owner client.
// It applies RLS like the real policies (a row is visible only if its project's
// owner_id is the token's sub) and offers the `list_conversations` RPC with the
// SQL function's ordering, preview and clamp. The service client throws: the
// conversation routes must never use it.
import type { Tables } from "@askwell/db";

type Project = Tables<"projects">;
type Conversation = Tables<"conversations">;
type MessageRow = Tables<"messages">;
type DbError = { code: string; message: string };

export const store = {
  projects: [] as Project[],
  conversations: [] as Conversation[],
  messages: [] as MessageRow[],
  /** Whose token the owner client carries; null = signed out (anon). */
  sub: null as string | null,
  /** Every call, as "owner:<table or rpc>". */
  calls: [] as string[],
  rpcArgs: [] as unknown[],
  /** Force the owner-client call on this table or rpc to fail once. */
  failOn: null as { target: string; error: DbError } | null,
  seq: 0,
};

export function resetStore() {
  store.projects = [];
  store.conversations = [];
  store.messages = [];
  store.sub = null;
  store.calls = [];
  store.rpcArgs = [];
  store.failOn = null;
  store.seq = 0;
}

const uuid = (prefix: string) => {
  store.seq += 1;
  return `${prefix}-0000-4000-8000-${String(store.seq).padStart(12, "0")}`;
};

export const at = (minute: number) =>
  new Date(Date.UTC(2026, 10, 27, 12, minute)).toISOString();

export function addProject(owner: string): Project {
  const id = uuid("11111111");
  const row: Project = {
    id,
    owner_id: owner,
    name: `Project ${store.seq}`,
    public_key: `pk_${id.replaceAll("-", "").slice(0, 24)}`,
    messages_used: 0,
    period_start: "2026-11-01T00:00:00+00:00",
    created_at: at(0),
  };
  store.projects.push(row);
  return row;
}

export function addConversation(projectId: string, createdAt = at(0)): Conversation {
  const row: Conversation = {
    id: uuid("22222222"),
    project_id: projectId,
    visitor_id: `visitor-${store.seq}`,
    created_at: createdAt,
  };
  store.conversations.push(row);
  return row;
}

export function addMessage(
  conversationId: string,
  role: string,
  body: string,
  createdAt: string,
): MessageRow {
  const row: MessageRow = {
    id: uuid("33333333"),
    conversation_id: conversationId,
    role,
    body,
    created_at: createdAt,
  };
  store.messages.push(row);
  return row;
}

// --- RLS ---------------------------------------------------------------------

const ownedProjectIds = () =>
  new Set(store.projects.filter((p) => p.owner_id === store.sub).map((p) => p.id));

const visible = {
  projects: () => store.projects.filter((p) => p.owner_id === store.sub),
  conversations: () => {
    const owned = ownedProjectIds();
    return store.conversations.filter((c) => owned.has(c.project_id));
  },
  messages: () => {
    const owned = new Set(visible.conversations().map((c) => c.id));
    return store.messages.filter((m) => owned.has(m.conversation_id));
  },
} as const;

type Table = keyof typeof visible;

function failure(target: string): DbError | null {
  if (store.failOn?.target !== target) return null;
  const { error } = store.failOn;
  store.failOn = null;
  return error;
}

function pick(row: object, cols: string) {
  const names = cols.split(",").map((c) => c.trim());
  const r = row as Record<string, unknown>;
  return Object.fromEntries(names.map((c) => [c, r[c]]));
}

const cmp = (a: unknown, b: unknown) =>
  String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

export function createOwnerClient() {
  return {
    from(table: string) {
      if (!(table in visible)) throw new Error(`unexpected table ${table}`);
      return {
        select(cols: string) {
          store.calls.push(`owner:${table}`);
          const filters: [string, unknown][] = [];
          const orders: [string, boolean][] = [];
          const rows = () => {
            const all = visible[table as Table]() as unknown as Record<string, unknown>[];
            const out = all.filter((r) => filters.every(([c, v]) => r[c] === v));
            out.sort((a, b) => {
              for (const [col, asc] of orders) {
                const d = cmp(a[col], b[col]);
                if (d) return asc ? d : -d;
              }
              return 0;
            });
            return out;
          };
          const q = {
            eq(col: string, v: unknown) {
              filters.push([col, v]);
              return q;
            },
            order(col: string, opts: { ascending: boolean }) {
              orders.push([col, opts.ascending]);
              return q;
            },
            async maybeSingle() {
              const error = failure(table);
              if (error) return { data: null, error };
              const row = rows()[0];
              return { data: row ? pick(row, cols) : null, error: null };
            },
            // Awaiting the builder runs the list query, as in supabase-js.
            then<T>(
              resolve: (v: { data: unknown[] | null; error: DbError | null }) => T,
              reject?: (e: unknown) => unknown,
            ) {
              const error = failure(table);
              const result = error
                ? { data: null, error }
                : { data: rows().map((r) => pick(r, cols)), error: null };
              return Promise.resolve(result).then(resolve, reject);
            },
          };
          return q;
        },
      };
    },

    async rpc(fn: string, args: { p_project_id: string; p_limit?: number }) {
      store.calls.push(`owner:rpc:${fn}`);
      store.rpcArgs.push(args);
      if (fn !== "list_conversations") throw new Error(`unexpected rpc ${fn}`);
      const error = failure(`rpc:${fn}`);
      if (error) return { data: null, error };

      const limit = Math.min(Math.max(args.p_limit ?? 50, 1), 50);
      const messages = visible.messages();
      const data = visible
        .conversations()
        .filter((c) => c.project_id === args.p_project_id)
        .map((c) => {
          const own = messages
            .filter((m) => m.conversation_id === c.id)
            .sort((a, b) => cmp(a.created_at, b.created_at) || cmp(a.id, b.id));
          const first = own.find((m) => m.role === "visitor");
          return {
            id: c.id,
            visitor_id: c.visitor_id,
            preview: first ? [...first.body].slice(0, 120).join("") : "",
            message_count: own.length,
            created_at: c.created_at,
            last_message_at: own.at(-1)?.created_at ?? c.created_at,
          };
        })
        .sort((a, b) => cmp(b.last_message_at, a.last_message_at) || cmp(b.id, a.id))
        .slice(0, limit);
      return { data, error: null };
    },
  };
}

export function createServiceClient(): never {
  throw new Error("conversation routes must not use the service client");
}
