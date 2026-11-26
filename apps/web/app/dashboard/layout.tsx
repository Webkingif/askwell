import type { Metadata } from "next";
import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import { Sidebar } from "../../components/dashboard";
import { ErrorState, GlassPanel, LoadingState } from "../../components/ui";
import { ensureAccount } from "../../lib/accounts";
import { DASHBOARD_PATH } from "../../lib/auth/routes";

export const metadata: Metadata = {
  title: { template: `%s · ${APP_NAME}`, default: `Dashboard · ${APP_NAME}` },
  robots: { index: false, follow: false },
};

/**
 * Checks the session here as well as in proxy.ts, then makes sure the owner
 * has an `accounts` row (plan `free` on first visit). Owner data routes
 * (Phase 2) must still call auth() themselves.
 */
async function RequireOwner({ children }: { children: React.ReactNode }) {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  try {
    await ensureAccount();
  } catch (error) {
    console.error(error);
    // error.tsx doesn't catch this layout's errors, so show the state here.
    return <AccountError />;
  }
  return children;
}

function AccountError() {
  return (
    <GlassPanel padding="lg">
      <ErrorState
        title="We couldn't load your account"
        message="Something went wrong on our side. Try again in a moment."
        action={
          <a
            href={DASHBOARD_PATH}
            className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
          >
            Try again
          </a>
        }
      />
    </GlassPanel>
  );
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
