import type { Metadata } from "next";
import { TabPlaceholder } from "../../../../../components/dashboard";

export const metadata: Metadata = { title: "Install" };

export default function InstallPage() {
  return <TabPlaceholder tab="install" />;
}
