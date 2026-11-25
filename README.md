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

## Deployments

Vercel builds the app from `apps/web` (root directory), installing from the workspace root lockfile.

| Environment | When                  | Notes                                                                                                            |
| ----------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Preview     | Every push to a PR    | One deployment per PR, on the Supabase dev project                                                               |
| Production  | Every merge to `main` | Built, but not promoted: automatic production promotion is off. The product owner promotes it (first in Phase 6) |

Previews are protected. Get the preview URL from GitHub (the Vercel comment on the PR, or the PR's deployment status), never from the branch name. Then send the bypass header with the value of the `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable:

```sh
curl -H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET" https://<preview-url>/
```

For browser tests, also send `x-vercel-set-bypass-cookie: true` on the first request.
