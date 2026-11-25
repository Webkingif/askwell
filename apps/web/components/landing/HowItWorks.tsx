import { GlassPanel } from "../ui";
import { LandingSection } from "./Section";
import { Reveal } from "./Reveal";

const STEPS = [
  {
    title: "Add your info",
    body: "Paste text or upload a PDF about your product, prices and policies.",
  },
  {
    title: "Copy one script tag",
    body: "Paste it into your site. The chat button appears in the corner.",
  },
  {
    title: "Visitors get answers",
    body: "The bot answers from your info, and you read every conversation.",
  },
] as const;

export function HowItWorks() {
  return (
    <LandingSection
      id="how-it-works"
      eyebrow="How it works"
      title="Live on your site in three steps"
    >
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <Reveal delay={i * 120} className="h-full">
              <GlassPanel className="h-full">
                <span
                  aria-hidden="true"
                  className="flex size-8 items-center justify-center rounded-full border border-line text-sm font-semibold"
                >
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </GlassPanel>
            </Reveal>
          </li>
        ))}
      </ol>
    </LandingSection>
  );
}
