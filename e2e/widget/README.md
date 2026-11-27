# Widget e2e: cross-origin check

Proves the Phase 2 "Done when" in a real browser:

1. A plain page on another origin (`http://localhost:4321`) installs the widget snippet.
2. The button shows.
3. The panel opens and gets a mock reply.
4. Close works, and a bad key renders nothing.
5. `/dashboard` refuses framing; `/embed` allows it.

It runs against a Vercel preview, so it isn't part of CI.

## Run it

```sh
PREVIEW_URL=https://askwell-git-<branch>-webkingif.vercel.app \
WIDGET_SNIPPET='<script src="https://…/widget.js" data-key="pk_…" async></script>' \
VERCEL_AUTOMATION_BYPASS_SECRET=… \
pnpm e2e:widget
```

| Variable                          | What                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PREVIEW_URL`                     | The preview's `https://` origin. The framing checks and the bad-key pages use it.                                                                               |
| `WIDGET_SNIPPET`                  | The snippet, copied from a project's **Install** tab on that preview. The test reads the app origin from its `src`; on a preview that's the per-deployment URL. |
| `WIDGET_KEY`                      | Instead of `WIDGET_SNIPPET`: a dev project's public key. The snippet is then built from `PREVIEW_URL`.                                                          |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Gets past preview protection (see below).                                                                                                                       |
| `PW_CHROMIUM_PATH`                | Optional. A Chromium to use when `pnpm exec playwright install chromium` isn't possible, e.g. `/usr/bin/chromium`.                                              |
| `HOST_PORT`                       | Optional. The host page's port, default `4321`.                                                                                                                 |

Never commit a key or a snippet. Pass them only as environment variables.

## How it works

- **Host page.** `serve.mjs` serves `host.html` on `HOST_PORT`, filling in the snippet at request time. The page has loud global CSS, so the test can check that nothing leaks either way.
  - `/bad-key` and `/unknown-key` serve the same page with a malformed key and with an unknown key.
  - `/frame?src=` serves a page that only frames a preview URL.
- **Preview protection.** The loader's config fetch is cross-origin and sends no credentials, so a bypass cookie can't help. The test adds `x-vercel-protection-bypass` with `context.route()`, only to requests for the preview and app origins. The page's own fetch doesn't set the header, so there's no CORS preflight, and no app code changes.
- **Closed shadow root.** The widget's shadow root is closed, so page scripts (and Playwright selectors) can't reach in. The test reads and clicks the button through the Chrome DevTools Protocol (`DOM.getDocument` with `pierce: true`), as a person would in DevTools.
- **Screenshots.** A screenshot of the open panel, and traces of failed runs, go to `test-results/e2e-widget/` (gitignored).

# Chat e2e: Phase 3 check (`chat.spec.ts`)

Proves the Phase 3 "Done when" on a preview, with real Gemini and Arcjet:

1. A PDF (`fixtures/quillfern-faq.pdf`, made-up facts) is uploaded through the owner API (upload-url → signed PUT → finalize) and polled until `ready`.
2. On a plain page on another origin, a question the PDF answers gets the right facts.
3. An unrelated question to the same project gets "I don't know". Chunks are present, so this goes through the model.
4. The 21st chat message in a minute is refused, and the panel shows "You're sending messages fast. Try again in a minute."

## Run it

```sh
PREVIEW_URL=https://askwell-git-<branch>-webkingif.vercel.app \
VERCEL_AUTOMATION_BYPASS_SECRET=… \
CLERK_SECRET_KEY=sk_test_… \
NEXT_PUBLIC_SUPABASE_URL=… \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=… \
pnpm e2e:widget chat.spec.ts
```

Name `chat.spec.ts`, or Playwright also runs `widget.spec.ts`, which needs `WIDGET_KEY`. The Clerk and Supabase values are the dev ones the preview uses. `PW_CHROMIUM_PATH` and `HOST_PORT` work as above. `E2E_OWNER_EMAIL` optionally changes the test owner.

## What it uses, and what it leaves

- **Test owner.** A Clerk dev-instance user, `askwell-e2e-chat+clerk_test@example.com`. The spec creates it on the first run and reuses it after. It signs in with a Backend API session, which works on development instances only, so the spec refuses a key that isn't `sk_test_`. Owner calls send a fresh session token as `Authorization: Bearer`.
- **Dedicated project.** Each run creates a project named `B5 e2e chat` and deletes it at the end, with its source (Storage file, row and chunks) deleted first. A project of that name left by a failed run is deleted at the start. Its `accounts` row stays, and each run reuses it.
- **Quota.** The run spends 2 real messages, the two answers, from the throwaway project's Free quota of 100. Other projects are not touched.
- **Rate limit.** The limit is 20 a minute per route, public key and IP. After the 2 panel questions, the spec sends 18 messages straight to the route, then the 21st through the panel. The 18 name a conversation that doesn't exist, so each passes Arcjet, where it's counted, then gets 404 at the conversation check. That's before the quota count and before any AI call. Run 2 back to back with real burst answers hit a 500, likely Gemini's own rate limit, so the burst avoids the model.
- **Flaky networks.** A request that fails before its connection is up (a TLS reset, DNS) is retried up to 3 times. The server never saw it, so nothing is created or counted twice.
- **Logs.** On a failure, Playwright prints request headers, including the bypass secret and a short-lived Clerk token. Don't paste failure output into a PR or chat.
- **Source status.** There's no owner GET route for sources, so the spec reads `knowledge_sources` through Supabase's REST API with the owner's Clerk token. RLS scopes that read to the owner.
- **Host page.** `/chat-host` is `host.html` with the throwaway project's snippet, served by `page.route()` on the host origin.
