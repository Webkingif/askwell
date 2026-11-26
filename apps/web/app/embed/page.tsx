// /embed?key=pk_... — the chat panel inside the widget iframe (project.md §6.5).
// Any site may frame this page (next.config.ts). It shows no dashboard
// chrome and no Clerk UI.
import type { Metadata } from "next";
import { Suspense } from "react";
import { APP_NAME } from "@askwell/shared";
import { EmbedContent } from "../../components/embed/EmbedContent";
import { LoadingState } from "../../components/ui";

export const metadata: Metadata = {
  title: `Chat · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

export default function EmbedPage({ searchParams }: PageProps<"/embed">) {
  return (
    <Suspense
      fallback={
        <div className="surface-light flex h-dvh w-full items-center justify-center bg-bg">
          <LoadingState title="Loading chat" />
        </div>
      }
    >
      <EmbedContent searchParams={searchParams} />
    </Suspense>
  );
}
