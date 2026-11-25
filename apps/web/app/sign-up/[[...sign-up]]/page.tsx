import type { Metadata } from "next";
import { Suspense } from "react";
import { SignUp } from "@clerk/nextjs";
import { APP_NAME } from "@askwell/shared";
import { Spinner } from "../../../components/ui";

export const metadata: Metadata = { title: `Sign up · ${APP_NAME}` };

/** Clerk's default sign-up (project.md §13). Methods are set in the Clerk dashboard. */
export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Suspense fallback={<Spinner size="lg" />}>
        <SignUp />
      </Suspense>
    </main>
  );
}
