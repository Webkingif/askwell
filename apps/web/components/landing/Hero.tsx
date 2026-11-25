import { APP_NAME } from "@askwell/shared";
import { Badge } from "../ui";
import { CtaLink } from "./CtaLink";

export const SIGN_UP_PATH = "/sign-up";

export function Hero() {
  return (
    <header className="relative">
      <nav
        aria-label="Main"
        className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8"
      >
        <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href="#pricing"
            className="focus-ring hidden rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-fg sm:inline-block"
          >
            Pricing
          </a>
          <CtaLink href={SIGN_UP_PATH} variant="secondary">
            Start free
          </CtaLink>
        </div>
      </nav>

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-5 pt-16 pb-12 text-center sm:px-8 sm:pt-28 sm:pb-20">
        <Badge variant="glass" className="motion-safe:animate-fade-in">
          AI support chat for any website
        </Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance motion-safe:animate-fade-in motion-safe:[animation-delay:80ms] sm:text-6xl">
          {APP_NAME} answers your visitors from your own docs.
        </h1>
        <p className="mt-5 max-w-xl text-base text-pretty text-muted motion-safe:animate-fade-in motion-safe:[animation-delay:160ms] sm:text-lg">
          Add your product info, paste one script tag, and a chat bot answers
          questions on your site, day and night.
        </p>
        <div className="mt-8 flex w-full flex-col items-center gap-3 motion-safe:animate-fade-in motion-safe:[animation-delay:240ms] sm:w-auto sm:flex-row">
          <CtaLink href={SIGN_UP_PATH} size="lg" className="w-full sm:w-auto">
            Start free
          </CtaLink>
          <CtaLink
            href="#demo"
            variant="secondary"
            size="lg"
            className="w-full sm:w-auto"
          >
            See the demo
          </CtaLink>
        </div>
        <p className="mt-4 text-xs text-muted motion-safe:animate-fade-in motion-safe:[animation-delay:320ms]">
          Free plan. No card needed.
        </p>
      </div>
    </header>
  );
}
