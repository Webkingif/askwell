import type { Metadata } from "next";
import { TabPlaceholder } from "../../../../../components/dashboard";

export const metadata: Metadata = { title: "Usage" };

export default function UsagePage() {
  return <TabPlaceholder tab="usage" />;
}
