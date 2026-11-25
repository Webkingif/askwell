import type { Metadata } from "next";
import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";
import { APP_NAME } from "@askwell/shared";
import { Spinner } from "../../../components/ui";

export const metadata: Metadata = { title: `Sign in · ${APP_NAME}` };

/** Clerk's default sign-in (project.md §13). Methods are set in the Clerk dashboard. */
export default function SignInPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Suspense fallback={<Spinner size="lg" />}>
        <SignIn />
      </Suspense>
    </main>
  );
}
