// Static server for the customer page, on its own origin (default
// http://localhost:4321). Paths:
//   /            host.html with the real snippet
//   /bad-key     host.html with a malformed data-key
//   /unknown-key host.html with a well-formed key no project has
//   /frame?src=  a page that only frames `src` (framing checks)
// The snippet is WIDGET_SNIPPET (pasted from the Install tab) when set,
// otherwise built from PREVIEW_URL and WIDGET_KEY.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const port = Number(process.env.HOST_PORT ?? 4321);
const preview = (process.env.PREVIEW_URL ?? "").replace(/\/+$/, "");
const template = readFileSync(new URL("./host.html", import.meta.url), "utf8");

const escapeAttr = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const snippetFor = (key) =>
  `<script src="${escapeAttr(preview)}/widget.js" data-key="${escapeAttr(key)}" async></script>`;

function page(snippet) {
  return template.replace("{{SNIPPET}}", snippet);
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  let body;
  switch (url.pathname) {
    case "/":
      body = page(
        process.env.WIDGET_SNIPPET ?? snippetFor(process.env.WIDGET_KEY ?? ""),
      );
      break;
    case "/bad-key":
      body = page(snippetFor("not-a-key"));
      break;
    case "/unknown-key":
      body = page(snippetFor("pk_e2eunknownkey0000000000"));
      break;
    case "/frame": {
      const src = url.searchParams.get("src") ?? "";
      if (!src.startsWith(`${preview}/`)) {
        res.writeHead(400).end("src must be on PREVIEW_URL");
        return;
      }
      body = `<!doctype html><title>frame</title><iframe id="f" src="${escapeAttr(src)}" width="600" height="400"></iframe>`;
      break;
    }
    default:
      res.writeHead(404).end();
      return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}).listen(port, "127.0.0.1", () => {
  console.log(`host page on http://localhost:${port}`);
});
