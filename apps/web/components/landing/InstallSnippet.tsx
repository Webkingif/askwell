import { PUBLIC_KEY_PREFIX } from "@askwell/shared";
import { GlassPanel } from "../ui";
import { LandingSection } from "./Section";
import { Reveal } from "./Reveal";

/** The install tag as plain text (project.md §6.5). Your real key is in the dashboard. */
export const INSTALL_SNIPPET = `<script src=".../widget.js" data-key="${PUBLIC_KEY_PREFIX}..."></script>`;

export function InstallSnippet() {
  return (
    <LandingSection
      id="install"
      eyebrow="Install"
      title="One line of code"
      intro="Paste it before </body> on any site: plain HTML, WordPress, Webflow, Shopify. Your dashboard gives you the tag with your own key."
    >
      <Reveal className="mx-auto w-full max-w-2xl">
        <GlassPanel padding="none" className="overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                aria-hidden="true"
                className="size-2.5 rounded-full bg-line"
              />
            ))}
            <span className="ml-2 text-xs text-muted">index.html</span>
          </div>
          <pre className="overflow-x-auto p-4 text-xs leading-relaxed sm:p-6 sm:text-sm">
            <code>{INSTALL_SNIPPET}</code>
          </pre>
        </GlassPanel>
      </Reveal>
    </LandingSection>
  );
}
