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
