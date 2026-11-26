import { AuthProvider } from "../../components/auth";

export default function SignInLayout({ children }: LayoutProps<"/sign-in">) {
  return <AuthProvider>{children}</AuthProvider>;
}
