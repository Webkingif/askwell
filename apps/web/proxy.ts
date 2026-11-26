import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import {
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  UNAUTHORIZED_STATUS,
  authDecision,
  routeAccess,
  unauthorizedBody,
} from "./lib/auth/routes";

// First gate only. Each owner page and route handler still checks auth itself
// (Clerk recommends protecting at the resource; proxy matching can be bypassed).
export default clerkMiddleware(
  async (auth, req) => {
    const pathname = req.nextUrl.pathname;
    // Skip the session lookup for public routes.
    if (routeAccess(pathname) === "public") return;
    const { userId, redirectToSignIn } = await auth();
    switch (authDecision(pathname, userId !== null)) {
      case "allow":
        return;
      case "unauthorized":
        return NextResponse.json(unauthorizedBody(), {
          status: UNAUTHORIZED_STATUS,
        });
      case "redirect-to-sign-in":
        return redirectToSignIn({ returnBackUrl: req.url });
    }
  },
  { signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH },
);

// Visitor-facing paths never reach Clerk: the landing page (/, which reads
// no session), /embed (the widget iframe),
// /api/widget/* (called by the loader) and /widget.js (static, skipped with
// the other static files). In a third-party iframe Clerk's cookies are
// cross-site, so its handshake redirect would loop forever (PPW-T11).
// These paths read no session; routeAccess() keeps them "public".
// Next reads this statically: keep it a literal (tests/proxy/matcher.test.ts).
export const config = {
  matcher: [
    // Skip the landing page, Next.js internals, the widget paths and static files, unless found in search params.
    "/((?!$|_next|embed(?:/|$)|api/widget/|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes, except the public widget API.
    "/(api(?!/widget/)|trpc)(.*)",
    // Always run for Clerk's frontend API routes.
    "/__clerk/(.*)",
  ],
};
