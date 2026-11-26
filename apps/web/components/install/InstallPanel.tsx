import { GlassPanel } from "../ui";
import { CopyButton } from "./CopyButton";

const SNIPPET_ID = "install-snippet";

/** The project's install tag, a copy button and three steps. */
export function InstallPanel({ snippet }: { snippet: string }) {
  return (
    <div className="flex flex-col gap-4">
      <GlassPanel padding="none" className="overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-fg">
              Your install code
            </h2>
            <p className="text-sm text-muted">
              One line. It works on any site: plain HTML, WordPress, Webflow,
              Shopify.
            </p>
          </div>
          <CopyButton text={snippet} targetId={SNIPPET_ID} />
        </div>
        <pre className="overflow-x-auto p-4 text-xs leading-relaxed sm:p-6 sm:text-sm">
          <code id={SNIPPET_ID} className="break-all whitespace-pre-wrap">
            {snippet}
          </code>
        </pre>
      </GlassPanel>

      <GlassPanel padding="md">
        <h2 className="text-base font-semibold text-fg">How to install</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-fg">
          <li>Copy the code above.</li>
          <li>
            Paste it into your site&apos;s HTML, just before{" "}
            <code className="rounded bg-subtle px-1 py-0.5 text-xs">
              &lt;/body&gt;
            </code>
            .
          </li>
          <li>Reload your site. The chat button appears in the corner.</li>
        </ol>
      </GlassPanel>
    </div>
  );
}
