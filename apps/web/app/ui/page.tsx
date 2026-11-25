import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { APP_NAME } from "@askwell/shared";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  GlassPanel,
  Input,
  LoadingState,
  Spinner,
} from "../../components/ui";

export const metadata: Metadata = {
  title: `UI kit · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

type Surface = "light" | "dark";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Showcase({ surface }: { surface: Surface }) {
  return (
    <div
      className={`surface-${surface} relative overflow-hidden rounded-xl border border-line px-4 py-8 sm:p-10`}
    >
      {/* Soft shapes behind the glass so the blur is visible. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-16 -left-10 size-56 rounded-full bg-fg opacity-15 blur-3xl" />
        <div className="absolute right-0 bottom-0 size-64 rounded-full bg-muted opacity-25 blur-3xl" />
      </div>

      <div className="relative flex flex-col gap-8">
        <h2 className="text-2xl font-semibold tracking-tight">
          {surface === "light"
            ? "Light surface (dashboard)"
            : "Dark surface (landing)"}
        </h2>

        <Section title="Glass panel">
          <div className="grid gap-4 sm:grid-cols-2">
            <GlassPanel>
              <p className="font-medium">GlassPanel</p>
              <p className="mt-1 text-sm text-muted">
                Translucent, blurred, hairline border.
              </p>
            </GlassPanel>
            <GlassPanel strong>
              <p className="font-medium">GlassPanel strong</p>
              <p className="mt-1 text-sm text-muted">
                More blur for busy backgrounds.
              </p>
            </GlassPanel>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Disabled</Button>
            <Button loading>Saving</Button>
            <Button variant="secondary" loading>
              Loading
            </Button>
          </div>
        </Section>

        <Section title="Input">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Bot name"
              placeholder="Support bot"
              hint="Shown in the widget header."
            />
            <Input
              label="Website URL"
              defaultValue="not a url"
              error="Enter a full URL."
            />
            <Input label="Disabled" placeholder="Can't edit" disabled />
            <Input
              label="Search"
              hideLabel
              placeholder="Search (hidden label)"
            />
          </div>
        </Section>

        <Section title="Badge and spinner">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="solid">Pro</Badge>
            <Badge>Free</Badge>
            <Badge variant="glass">Beta</Badge>
            <Spinner size="sm" />
            <Spinner />
            <Spinner size="lg" />
          </div>
        </Section>

        <Section title="States">
          <div className="grid gap-4 lg:grid-cols-3">
            <GlassPanel padding="none">
              <EmptyState
                title="No conversations yet"
                message="Install the widget on your site to start getting chats."
                action={<Button size="sm">Get the snippet</Button>}
              />
            </GlassPanel>
            <GlassPanel padding="none">
              <LoadingState
                title="Loading conversations"
                message="This only takes a moment."
              />
            </GlassPanel>
            <GlassPanel padding="none">
              <ErrorState
                title="Couldn't load conversations"
                message="Check your connection and try again."
                action={
                  <Button size="sm" variant="secondary">
                    Try again
                  </Button>
                }
              />
            </GlassPanel>
          </div>
        </Section>
      </div>
    </div>
  );
}

export default function UiPreviewPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          {APP_NAME} UI kit
        </h1>
        <p className="mt-1 text-sm text-muted">
          Every base component on both surfaces. Not available in production.
        </p>
      </header>
      <Showcase surface="light" />
      <Showcase surface="dark" />
    </main>
  );
}
