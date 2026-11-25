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

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
    // Always run for Clerk's frontend API routes.
    "/__clerk/(.*)",
  ],
};
