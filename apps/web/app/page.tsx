import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import {
  DemoMock,
  Footer,
  Hero,
  HowItWorks,
  InstallSnippet,
  Pricing,
} from "../components/landing";

export const metadata: Metadata = {
  title: `${APP_NAME}: AI support chat for any website`,
  description: `${APP_NAME} answers your visitors' questions from your own product info. Add your info, paste one script tag, done.`,
};

export default function Home() {
  return (
    <div className="surface-dark relative flex flex-1 flex-col overflow-x-clip">
      {/* Without JS, show everything the scroll reveal would have hidden. */}
      <noscript>
        <style>{`[data-reveal]{opacity:1!important;translate:none!important}`}</style>
      </noscript>
      {/* Soft shapes behind the glass so the blur reads on black. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[60rem]"
      >
        <div className="absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full bg-fg opacity-10 blur-3xl" />
        <div className="absolute top-96 -right-40 size-96 rounded-full bg-muted opacity-15 blur-3xl" />
      </div>
      <div className="relative flex flex-1 flex-col">
        <Hero />
        <main className="flex-1">
          <HowItWorks />
          <DemoMock />
          <Pricing />
          <InstallSnippet />
        </main>
        <Footer />
      </div>
    </div>
  );
}
