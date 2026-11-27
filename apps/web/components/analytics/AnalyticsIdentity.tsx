"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { setAnalyticsUser } from "../../lib/analytics/client";

/**
 * Tells PostHog who is signed in: identify with the Clerk user ID, reset on
 * sign-out. Rendered inside <ClerkProvider> (components/auth). It does nothing
 * on a page where PostHog hasn't started.
 */
export function AnalyticsIdentity() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => {
    if (isLoaded) setAnalyticsUser(userId ?? null);
  }, [isLoaded, userId]);
  return null;
}
