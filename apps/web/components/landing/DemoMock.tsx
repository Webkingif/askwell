import { APP_NAME } from "@askwell/shared";
import { Badge, Button, GlassPanel, Input, cx } from "../ui";
import { LandingSection } from "./Section";
import { Reveal } from "./Reveal";

type Line = { from: "visitor" | "bot"; text: string };

const CONVERSATION: readonly Line[] = [
  { from: "visitor", text: "How do I add the chat to my site?" },
  {
    from: "bot",
    text: "Copy the script tag from your dashboard and paste it before </body>. That's it.",
  },
  { from: "visitor", text: "Can it answer from my PDF price list?" },
  {
    from: "bot",
    text: "Yes. Upload the PDF and I'll answer from it, word for word where it matters.",
  },
];

function Bubble({ from, text }: Line) {
  const mine = from === "visitor";
  return (
    <li className={cx("flex", mine ? "justify-end" : "justify-start")}>
      <p
        className={cx(
          "max-w-[85%] rounded-lg px-3 py-2 text-sm",
          mine
            ? "bg-accent text-accent-fg"
            : "border border-line bg-subtle text-fg",
        )}
      >
        <span className="sr-only">{mine ? "Visitor: " : "Bot: "}</span>
        {text}
      </p>
    </li>
  );
}

/** A static, non-interactive picture of the chat panel. The real widget replaces it later. */
export function DemoMock() {
  return (
    <LandingSection
      id="demo"
      eyebrow="Live demo"
      title="What your visitors see"
      intro="A preview of the chat panel. Answers come only from the info you add."
    >
      <Reveal className="relative mx-auto w-full max-w-sm">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-10 rounded-full bg-fg opacity-10 blur-3xl"
        />
        <figure className="relative">
          <GlassPanel
            strong
            padding="none"
            inert
            className="flex flex-col overflow-hidden select-none"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-fg"
                />
                <span className="text-sm font-semibold">Chat with us</span>
              </div>
              <Badge variant="outline">Preview</Badge>
            </div>
            <ul className="flex flex-col gap-3 px-4 py-4">
              {CONVERSATION.map((line, i) => (
                <Bubble key={i} {...line} />
              ))}
              <li className="flex justify-start" aria-label="Bot is typing">
                <span className="flex gap-1 rounded-lg border border-line bg-subtle px-3 py-3">
                  {[0, 150, 300].map((d) => (
                    <span
                      key={d}
                      aria-hidden="true"
                      style={{ animationDelay: `${d}ms` }}
                      className="size-1.5 rounded-full bg-muted motion-safe:animate-pulse-soft"
                    />
                  ))}
                </span>
              </li>
            </ul>
            <div className="flex items-end gap-2 border-t border-line px-4 py-3">
              <Input
                label="Message"
                hideLabel
                placeholder="Ask a question…"
                disabled
                tabIndex={-1}
              />
              <Button disabled tabIndex={-1}>
                Send
              </Button>
            </div>
            <p className="pb-3 text-center text-xs text-muted">
              Powered by {APP_NAME}
            </p>
          </GlassPanel>
          <figcaption className="mt-4 text-center text-xs text-muted">
            Static preview. Not a live chat.
          </figcaption>
        </figure>
      </Reveal>
    </LandingSection>
  );
}
