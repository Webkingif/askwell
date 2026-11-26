// An in-memory `projects` table behind fake owner and service Supabase clients.
// The owner client applies RLS like the real policies (owner_id = sub); the
// service client offers only the `create_project` RPC, with its limit check.
import type { Tables } from "@askwell/db";

type Row = Tables<"projects">;
type DbError = { code: string; message: string };

export const store = {
  rows: [] as Row[],
  plans: new Map<string, "free" | "pro">(),
  /** Whose token the owner client carries; null = signed out (anon). */
  sub: null as string | null,
  /** Every call, as "owner:<op>" or "service:<op>". */
  calls: [] as string[],
  rpcArgs: [] as unknown[],
  /** Force the next owner-client query to fail. */
  ownerError: null as DbError | null,
  seq: 0,
};

export function resetStore() {
  store.rows = [];
  store.plans.clear();
  store.sub = null;
  store.calls = [];
  store.rpcArgs = [];
  store.ownerError = null;
  store.seq = 0;
}

export function addRow(owner: string, name: string, id?: string): Row {
  store.seq += 1;
  const n = String(store.seq).padStart(12, "0");
  const row: Row = {
    id: id ?? `00000000-0000-4000-8000-${n}`,
    owner_id: owner,
    name,
    public_key: `pk_${n.padEnd(24, "x")}`,
    messages_used: 0,
    period_start: "2026-11-01T00:00:00+00:00",
    // Later rows are newer.
    created_at: new Date(Date.UTC(2026, 10, 1, 0, 0, store.seq)).toISOString(),
  };
  store.rows.push(row);
  return row;
}

const COLUMNS = [
  "id",
  "name",
  "public_key",
  "messages_used",
  "period_start",
  "created_at",
] as const;

function pick(row: Row, cols: string) {
  const names = cols.split(",").map((c) => c.trim());
  return Object.fromEntries(names.map((c) => [c, row[c as keyof Row]]));
}

/** Rows RLS lets the current owner see. */
const visible = () => store.rows.filter((r) => r.owner_id === store.sub);

export function createOwnerClient() {
  return {
    from(table: string) {
      if (table !== "projects") throw new Error(`unexpected table ${table}`);
      const filters: [keyof Row, unknown][] = [];
      const match = () =>
        visible().filter((r) => filters.every(([c, v]) => r[c] === v));
      const fail = () => {
        const error = store.ownerError;
        store.ownerError = null;
        return error;
      };

      return {
        select(cols: string) {
          store.calls.push("owner:select");
          expectColumns(cols);
          const q = {
            eq(col: keyof Row, v: unknown) {
              filters.push([col, v]);
              return q;
            },
            async order(col: keyof Row, opts: { ascending: boolean }) {
              const error = fail();
              if (error) return { data: null, error };
              const rows = [...match()].sort((a, b) =>
                String(a[col]).localeCompare(String(b[col])),
              );
              if (!opts.ascending) rows.reverse();
              return { data: rows.map((r) => pick(r, cols)), error: null };
            },
            async maybeSingle() {
              const error = fail();
              if (error) return { data: null, error };
              const row = match()[0];
              return { data: row ? pick(row, cols) : null, error: null };
            },
          };
          return q;
        },
        update(values: Partial<Row>) {
          store.calls.push("owner:update");
          if (Object.keys(values).join() !== "name") {
            // Column grants allow `name` only.
            throw new Error("owner may update name only");
          }
          return {
            eq(col: keyof Row, v: unknown) {
              filters.push([col, v]);
              return {
                select(cols: string) {
                  return {
                    async maybeSingle() {
                      const error = fail();
                      if (error) return { data: null, error };
                      const row = match()[0];
                      if (!row) return { data: null, error: null };
                      Object.assign(row, values);
                      return { data: pick(row, cols), error: null };
                    },
                  };
                },
              };
            },
          };
        },
        delete() {
          store.calls.push("owner:delete");
          return {
            eq(col: keyof Row, v: unknown) {
              filters.push([col, v]);
              return {
                async select(cols: string) {
                  const error = fail();
                  if (error) return { data: null, error };
                  const gone = match();
                  store.rows = store.rows.filter((r) => !gone.includes(r));
                  return { data: gone.map((r) => pick(r, cols)), error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

function expectColumns(cols: string) {
  if (cols !== "id" && cols !== COLUMNS.join(", ")) {
    throw new Error(`unexpected columns ${cols}`);
  }
}

export function createServiceClient() {
  return {
    from() {
      throw new Error("projects must not use the service client for tables");
    },
    async rpc(
      fn: string,
      args: { p_owner_id: string; p_name: string; p_max_projects: number },
    ) {
      store.calls.push(`service:rpc:${fn}`);
      store.rpcArgs.push(args);
      if (fn !== "create_project") throw new Error(`unexpected rpc ${fn}`);
      const count = store.rows.filter(
        (r) => r.owner_id === args.p_owner_id,
      ).length;
      if (count >= args.p_max_projects) {
        return {
          data: null,
          error: { code: "P0001", message: "project_limit" },
        };
      }
      return { data: addRow(args.p_owner_id, args.p_name), error: null };
    },
  };
}
