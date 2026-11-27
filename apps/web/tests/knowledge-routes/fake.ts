// In-memory `projects` and `knowledge_sources` tables, the `knowledge` bucket,
// and fake owner and service Supabase clients over them: just the calls the
// knowledge routes make.
//
// - The owner client applies RLS like the real policies: projects where
//   owner_id = sub, sources of those projects; SELECT only.
// - The service client skips RLS and offers reserve_knowledge_source with the
//   real function's checks (stale reclaim, count, limit).

type Row = Record<string, unknown>;
type DbError = { code?: string; message: string; status?: number; statusCode?: string };
type Result = { data: unknown; error: DbError | null };

export const STALE_MS = 2 * 60 * 60 * 1000;

export const store = {
  projects: [] as Row[],
  sources: [] as Row[],
  /** Objects in the `knowledge` bucket, by key. */
  files: new Map<string, Uint8Array>(),
  plans: new Map<string, "free" | "pro">(),
  /** Whose token the owner client carries; null = signed out (anon). */
  sub: null as string | null,
  /** Every call, as "owner:<table>.<op>", "service:<table>.<op>", "rpc:<fn>" or "storage:<op>". */
  calls: [] as string[],
  /** Make these fail, e.g. "storage.remove", "knowledge_sources.update". */
  fail: new Set<string>(),
  /** Keys signed URLs were made for. */
  signed: [] as string[],
  seq: 0,
};

export function resetStore() {
  store.projects = [];
  store.sources = [];
  store.files.clear();
  store.plans.clear();
  store.sub = null;
  store.calls = [];
  store.fail.clear();
  store.signed = [];
  store.seq = 0;
}

function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}-0000-4000-8000-${String(store.seq).padStart(12, "0")}`;
}

export function addProject(owner: string): Row {
  const id = nextId("aaaaaaaa");
  const row = {
    id,
    owner_id: owner,
    name: "Project",
    public_key: `pk_${id.slice(-12).padEnd(24, "x")}`,
    messages_used: 0,
    period_start: "2026-11-01T00:00:00+00:00",
    created_at: "2026-11-01T00:00:00+00:00",
  };
  store.projects.push(row);
  return row;
}

export function addSource(projectId: string, over: Row = {}): Row {
  const row: Row = {
    id: nextId("bbbbbbbb"),
    project_id: projectId,
    title: "Doc",
    type: "text",
    storage_key: null,
    status: "ready",
    created_at: new Date().toISOString(),
    ...over,
  };
  store.sources.push(row);
  return row;
}

const tables = () => ({ projects: store.projects, knowledge_sources: store.sources });
type Table = keyof ReturnType<typeof tables>;

type Filter = (row: Row) => boolean;

class Query implements PromiseLike<Result> {
  private op: "select" | "update" | "delete" = "select";
  private filters: Filter[] = [];
  private values: Row = {};
  private columns: string | null = null;

  constructor(
    private role: "owner" | "service",
    private table: Table,
  ) {}

  select(columns = "*") {
    // After update/delete, select() only says what to return.
    this.columns = columns;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.values = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((r) => String(r[column]) < value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(r[column]) >= value);
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator !== "is" || value !== null) throw new Error("fake: unsupported not()");
    this.filters.push((r) => r[column] !== null && r[column] !== undefined);
    return this;
  }
  async maybeSingle(): Promise<Result> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    const rows = data as Row[];
    if (rows.length > 1) return { data: null, error: { code: "PGRST116", message: "many rows" } };
    return { data: rows[0] ?? null, error: null };
  }
  async single(): Promise<Result> {
    const { data, error } = await this.maybeSingle();
    if (error) return { data: null, error };
    if (!data) return { data: null, error: { code: "PGRST116", message: "no rows" } };
    return { data, error: null };
  }
  then<A = Result, B = never>(
    ok?: ((value: Result) => A | PromiseLike<A>) | null,
    bad?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }

  /** RLS: what the owner client may see. */
  private visible(row: Row): boolean {
    if (this.role === "service") return true;
    if (store.sub === null) return false;
    const owned = store.projects.filter((p) => p.owner_id === store.sub).map((p) => p.id);
    return this.table === "projects" ? row.owner_id === store.sub : owned.includes(row.project_id);
  }

  private pick(row: Row): Row {
    if (!this.columns || this.columns === "*") return { ...row };
    const names = this.columns.split(",").map((c) => c.trim());
    return Object.fromEntries(names.map((c) => [c, row[c]]));
  }

  private async run(): Promise<Result> {
    store.calls.push(`${this.role}:${this.table}.${this.op}`);
    if (store.fail.has(`${this.table}.${this.op}`)) {
      return { data: null, error: { code: "XX000", message: `${this.table}.${this.op} failed` } };
    }
    if (this.role === "owner" && this.op !== "select") {
      // Owners have no write grants on these tables in this fake.
      return { data: null, error: { code: "42501", message: "permission denied" } };
    }
    const rows = tables()[this.table];
    const hits = rows.filter((r) => this.visible(r) && this.filters.every((f) => f(r)));
    switch (this.op) {
      case "select":
        return { data: hits.map((r) => this.pick(r)), error: null };
      case "update":
        for (const r of hits) Object.assign(r, this.values);
        return { data: this.columns ? hits.map((r) => this.pick(r)) : null, error: null };
      case "delete":
        store.sources = store.sources.filter((r) => !hits.includes(r));
        if (this.table === "projects") store.projects = store.projects.filter((r) => !hits.includes(r));
        return { data: this.columns ? hits.map((r) => this.pick(r)) : null, error: null };
    }
  }
}

function reserve(args: Record<string, unknown>): Result {
  store.calls.push("rpc:reserve_knowledge_source");
  if (store.fail.has("rpc.reserve_knowledge_source")) {
    return { data: null, error: { code: "XX000", message: "rpc failed" } };
  }
  const projectId = args.p_project_id;
  if (!store.projects.some((p) => p.id === projectId)) {
    return { data: null, error: { code: "P0002", message: "not_found" } };
  }
  const cutoff = new Date(Date.now() - STALE_MS).toISOString();
  store.sources = store.sources.filter(
    (s) => !(s.project_id === projectId && s.status === "uploading" && String(s.created_at) < cutoff),
  );
  const count = store.sources.filter((s) => s.project_id === projectId).length;
  if (count >= Number(args.p_limit)) {
    return { data: null, error: { code: "P0001", message: "plan_limit_reached" } };
  }
  if (store.sources.some((s) => args.p_storage_key && s.storage_key === args.p_storage_key)) {
    return { data: null, error: { code: "23505", message: "duplicate key" } };
  }
  const row = addSource(String(projectId), {
    title: args.p_title,
    type: args.p_type,
    storage_key: args.p_storage_key ?? null,
    status: args.p_status,
  });
  return { data: { ...row }, error: null };
}

const missing = (): DbError => ({
  message: "Object not found",
  status: 404,
  statusCode: "404",
});

const bucket = (name: string) => {
  if (name !== "knowledge") throw new Error(`fake: unexpected bucket ${name}`);
  const fails = (op: string) => {
    store.calls.push(`storage:${op}`);
    return store.fail.has(`storage.${op}`);
  };
  return {
    createSignedUploadUrl: async (key: string) => {
      if (fails("createSignedUploadUrl")) return { data: null, error: { message: "sign failed" } };
      store.signed.push(key);
      return {
        data: { signedUrl: `https://storage.test/upload/sign/knowledge/${key}?token=t`, token: "t", path: key },
        error: null,
      };
    },
    info: async (key: string) => {
      if (fails("info")) return { data: null, error: { message: "info failed", status: 500 } };
      const file = store.files.get(key);
      if (!file) return { data: null, error: missing() };
      return { data: { name: key, size: file.byteLength }, error: null };
    },
    download: async (key: string) => {
      if (fails("download")) return { data: null, error: { message: "download failed" } };
      const file = store.files.get(key);
      if (!file) return { data: null, error: missing() };
      return { data: new Blob([new Uint8Array(file)]), error: null };
    },
    remove: async (keys: string[]) => {
      if (fails("remove")) return { data: null, error: { message: "remove failed" } };
      for (const k of keys) store.files.delete(k);
      return { data: [], error: null };
    },
  };
};

export function createOwnerClient() {
  return { from: (table: Table) => new Query("owner", table) };
}

export function createServiceClient() {
  return {
    from: (table: Table) => new Query("service", table),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn !== "reserve_knowledge_source") throw new Error(`fake: unexpected rpc ${fn}`);
      return reserve(args);
    },
    storage: { from: bucket },
  };
}
