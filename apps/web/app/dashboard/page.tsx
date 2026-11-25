import type { Metadata } from "next";
import { Suspense } from "react";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { APP_NAME } from "@askwell/shared";
import { LoadingState } from "../../components/ui";

export const metadata: Metadata = {
  title: `Dashboard · ${APP_NAME}`,
  robots: { index: false, follow: false },
};

/** Checks the session here too, not only in proxy.ts. */
async function SignedInDashboard() {
  const { userId, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();
  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <UserButton />
      </header>
      <p className="text-sm text-muted">
        You&apos;re signed in. Projects arrive in the next update.
      </p>
    </>
  );
}

/** Placeholder so sign-in has somewhere to land. B4 replaces it. */
export default function DashboardPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-5 py-8 sm:px-8">
      <Suspense fallback={<LoadingState title="Loading your dashboard" />}>
        <SignedInDashboard />
      </Suspense>
    </main>
  );
}
