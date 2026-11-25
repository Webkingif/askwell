import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { APP_NAME } from "@askwell/shared";
import { DASHBOARD_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "../lib/auth/routes";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "AI support chat for any website.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <ClerkProvider
          signInUrl={SIGN_IN_PATH}
          signUpUrl={SIGN_UP_PATH}
          signInFallbackRedirectUrl={DASHBOARD_PATH}
          signUpFallbackRedirectUrl={DASHBOARD_PATH}
          afterSignOutUrl={SIGN_IN_PATH}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
