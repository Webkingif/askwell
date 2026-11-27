// An in-memory stand-in for the service client: just the calls processSource
// makes, on knowledge_sources, knowledge_chunks and the knowledge bucket.

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

export type FakeOptions = {
  /** Make this table operation fail, e.g. "knowledge_chunks.insert". */
  fail?: string[];
};

export class FakeSupabase {
  tables: Record<string, Row[]> = { knowledge_sources: [], knowledge_chunks: [] };
  files = new Map<string, Uint8Array>();
  /** Every bucket a download was asked from. */
  buckets: string[] = [];
  fail: Set<string>;

  constructor(options: FakeOptions = {}) {
    this.fail = new Set(options.fail);
  }

  from(table: string) {
    return new Query(this, table);
  }

  storage = {
    from: (bucket: string) => ({
      download: async (key: string) => {
        this.buckets.push(bucket);
        if (this.fail.has("storage.download")) {
          return { data: null, error: { message: "download failed" } };
        }
        const file = this.files.get(`${bucket}/${key}`);
        if (!file) return { data: null, error: { message: "Object not found" } };
        return { data: new Blob([new Uint8Array(file)]), error: null };
      },
    }),
  };

  rows(table: string, where: Row = {}): Row[] {
    return this.tables[table]!.filter((r) =>
      Object.entries(where).every(([k, v]) => r[k] === v),
    );
  }
}

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: [string, unknown][] = [];
  private payload: Row | Row[] | null = null;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select() {
    this.op = "select";
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  update(values: Row) {
    this.op = "update";
    this.payload = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  async maybeSingle(): Promise<Result> {
    const { data, error } = await this.run();
    if (error) return { data: null, error };
    return { data: (data as Row[])[0] ?? null, error: null };
  }

  then<A = Result, B = never>(
    ok?: ((value: Result) => A | PromiseLike<A>) | null,
    bad?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }

  private matches = (row: Row) => this.filters.every(([k, v]) => row[k] === v);

  private async run(): Promise<Result> {
    if (this.db.fail.has(`${this.table}.${this.op}`)) {
      return { data: null, error: { message: `${this.table}.${this.op} failed` } };
    }
    const rows = this.db.tables[this.table]!;
    switch (this.op) {
      case "select":
        return { data: rows.filter(this.matches).map((r) => ({ ...r })), error: null };
      case "insert": {
        const added = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map(
          (r): Row => ({ id: crypto.randomUUID(), ...r }),
        );
        // The chunks' (source_id, project_id) foreign key.
        if (this.table === "knowledge_chunks") {
          for (const chunk of added) {
            const source = this.db.rows("knowledge_sources", {
              id: chunk.source_id,
              project_id: chunk.project_id,
            });
            if (source.length === 0) {
              return { data: null, error: { message: "violates foreign key constraint" } };
            }
          }
        }
        rows.push(...added);
        return { data: null, error: null };
      }
      case "update":
        for (const row of rows.filter(this.matches)) Object.assign(row, this.payload);
        return { data: null, error: null };
      case "delete":
        this.db.tables[this.table] = rows.filter((r) => !this.matches(r));
        return { data: null, error: null };
    }
  }
}
