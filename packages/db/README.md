# @askwell/db

| File                 | What                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`           | Supabase-generated `Database` types. Regenerate after a migration merges (Supabase MCP type generator, or `pnpm db:types`). Don't edit by hand.                           |
| `src/index.ts`       | Re-exports the types: `import type { Database, Tables } from "@askwell/db"`.                                                                                              |
| `supabase-pglite.ts` | Test helper: in-memory Postgres (pglite + pgvector) with Supabase's roles, `auth.jwt()` and default grants stubbed, and every migration in `supabase/migrations` applied. |
| `tests/`             | Schema, grant and RLS tests for the migrations.                                                                                                                           |

## Testing a migration

```ts
import { createSupabasePglite } from "@askwell/db/supabase-pglite";

const sb = await createSupabasePglite();
await sb
  .asRole("service_role")
  .query("insert into public.accounts (clerk_user_id) values ('user_a')");
const r = await sb
  .asRole("authenticated", { sub: "user_a" })
  .query("select * from public.accounts");
```

`asRole(role, claims)` runs each query in its own transaction, as `anon`, `authenticated` or `service_role`, with `claims` in `request.jwt.claims` (what `auth.jwt()` reads). `sb.db` is the superuser connection, which bypasses RLS.

Never run a local Supabase stack or a Docker database.
