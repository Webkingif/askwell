import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import { Sidebar } from "../../components/dashboard";
import { LoadingState } from "../../components/ui";

export const metadata: Metadata = {
  title: { template: `%s · ${APP_NAME}`, default: `Dashboard · ${APP_NAME}` },
  robots: { index: false, follow: false },
};

/**
 * Checks the session here as well as in proxy.ts. Owner data routes
 * (Phase 2) must still call auth() themselves.
 */
async function RequireOwner({ children }: { children: React.ReactNode }) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  return children;
}

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <div className="surface-light relative isolate flex flex-1 flex-col md:flex-row">
      {/* Soft shapes behind the glass so the blur reads on a light page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-32 -left-32 size-[28rem] rounded-full bg-grey-200 opacity-70 blur-3xl" />
        <div className="absolute -right-40 bottom-0 size-[32rem] rounded-full bg-grey-300 opacity-40 blur-3xl" />
      </div>
      <Sidebar />
      <main className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-8 md:py-8">
        <Suspense fallback={<LoadingState title="Loading your dashboard" />}>
          <RequireOwner>{children}</RequireOwner>
        </Suspense>
      </main>
    </div>
  );
}
