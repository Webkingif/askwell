import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

export interface LandingSectionProps {
  id: string;
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
}

export function LandingSection({
  id,
  eyebrow,
  title,
  intro,
  children,
}: LandingSectionProps) {
  const headingId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="mx-auto w-full max-w-5xl scroll-mt-20 px-5 py-20 sm:px-8 sm:py-28"
    >
      <Reveal className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
        <p className="text-xs font-semibold tracking-widest text-muted uppercase">
          {eyebrow}
        </p>
        <h2
          id={headingId}
          className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
        >
          {title}
        </h2>
        {intro && (
          <p className="mt-4 text-base text-pretty text-muted sm:text-lg">
            {intro}
          </p>
        )}
      </Reveal>
      {children}
    </section>
  );
}
