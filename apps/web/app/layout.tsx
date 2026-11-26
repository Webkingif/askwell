import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "AI support chat for any website.",
};

// No <ClerkProvider> here: only the dashboard, sign-in and sign-up load Clerk
// (components/auth). The landing page and /embed load none.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
