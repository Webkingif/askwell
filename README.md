# Askwell

An AI support chat widget for any website. See `docs/project.md` for what we build and `docs/plan.md` for the build order.

## Setup

Needs Node 26 (`.nvmrc`) and pnpm (version pinned in `package.json` → `packageManager`; `corepack enable` picks it up).

```sh
pnpm install
cp .env.example .env.local   # fill in values as each phase needs them
pnpm dev                     # http://localhost:3000
```

## Layout

| Path              | What                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `apps/web`        | Next.js app (App Router, Tailwind): landing, dashboard, `/embed`, `/api` |
| `apps/widget`     | Vanilla TS loader, bundled by esbuild to `apps/widget/dist/widget.js`    |
| `packages/shared` | The contract: `APP_NAME`, API types, zod schemas, plan limits            |
| `packages/db`     | Generated Supabase types and the pglite test helper (Phase 1)            |

## Commands

| Command                                                  | Does                                                        |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`                                               | Run every workspace's dev script (the app on :3000)         |
| `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` | Checks across all workspaces (`pnpm -r`). CI runs all four. |
| `pnpm --filter widget build`                             | Build only the widget bundle                                |
| `pnpm format`                                            | Prettier                                                    |
| `pnpm db:types`                                          | Placeholder until Phase 1                                   |
