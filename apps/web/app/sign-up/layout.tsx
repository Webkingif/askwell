import { AuthProvider } from "../../components/auth";

export default function SignUpLayout({ children }: LayoutProps<"/sign-up">) {
  return <AuthProvider>{children}</AuthProvider>;
}
