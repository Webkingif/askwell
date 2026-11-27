import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { AnalyticsIdentity } from "../analytics";
import {
  DASHBOARD_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
} from "../../lib/auth/routes";

/** The props every page that uses Clerk passes to <ClerkProvider>. */
export const CLERK_PROVIDER_PROPS = {
  signInUrl: SIGN_IN_PATH,
  signUpUrl: SIGN_UP_PATH,
  signInFallbackRedirectUrl: DASHBOARD_PATH,
  signUpFallbackRedirectUrl: DASHBOARD_PATH,
  afterSignOutUrl: SIGN_IN_PATH,
} as const;

/**
 * Loads Clerk for the pages that use it on the client: the dashboard
 * (UserButton), /sign-in and /sign-up. It is not in the root layout, so the
 * landing page and /embed (inside customers' sites) load no Clerk at all
 * (project.md §6.5 Isolation, §9). Clerk supports rendering the provider
 * deeper in the tree for this. It also tells PostHog who is signed in.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider {...CLERK_PROVIDER_PROPS}>
      <AnalyticsIdentity />
      {children}
    </ClerkProvider>
  );
}
