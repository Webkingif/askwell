import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Stand-in provider: renders a marker and its props, so we can see where
// Clerk is loaded and with what.
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({
    children,
    ...props
  }: { children: ReactNode } & Record<string, string>) => (
    <div data-clerk-provider={JSON.stringify(props)}>{children}</div>
  ),
  useAuth: () => ({ isLoaded: false, userId: null }),
}));
// The dashboard layout's server-only imports (not rendered here).
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("../../lib/accounts", () => ({ ensureAccount: vi.fn() }));
vi.mock("../../components/dashboard", () => ({ Sidebar: () => null }));

const { AuthProvider, CLERK_PROVIDER_PROPS } =
  await import("../../components/auth");
const { DASHBOARD_PATH, SIGN_IN_PATH, SIGN_UP_PATH } =
  await import("../../lib/auth/routes");
const { default: RootLayout } = await import("../../app/layout");
const { default: DashboardLayout } = await import("../../app/dashboard/layout");
const { default: SignInLayout } = await import("../../app/sign-in/layout");
const { default: SignUpLayout } = await import("../../app/sign-up/layout");

type AnyLayout = (props: { children: ReactNode }) => ReactElement;
const call = (layout: unknown) =>
  (layout as AnyLayout)({ children: <p>page</p> });

describe("Clerk loads only where it's used (PPW-T12)", () => {
  it("the root layout has no ClerkProvider (landing, /embed, /ui)", () => {
    const html = renderToStaticMarkup(call(RootLayout));
    expect(html).toContain("<p>page</p>");
    expect(html).not.toContain("data-clerk-provider");
  });

  it.each([
    ["dashboard", DashboardLayout],
    ["sign-in", SignInLayout],
    ["sign-up", SignUpLayout],
  ])("the %s layout wraps its pages in AuthProvider", (_, layout) => {
    expect(call(layout).type).toBe(AuthProvider);
  });

  it("AuthProvider renders ClerkProvider with the original props", () => {
    const html = renderToStaticMarkup(
      <AuthProvider>
        <p>page</p>
      </AuthProvider>,
    );
    const match = html.match(/data-clerk-provider="([^"]*)"/);
    const props = JSON.parse(match![1]!.replace(/&quot;/g, '"'));
    expect(props).toEqual({
      signInUrl: SIGN_IN_PATH,
      signUpUrl: SIGN_UP_PATH,
      signInFallbackRedirectUrl: DASHBOARD_PATH,
      signUpFallbackRedirectUrl: DASHBOARD_PATH,
      afterSignOutUrl: SIGN_IN_PATH,
    });
    expect(props).toEqual(CLERK_PROVIDER_PROPS);
    expect(html).toContain("<p>page</p>");
  });
});
