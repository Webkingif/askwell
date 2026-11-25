import type { Metadata } from "next";
import { TabPlaceholder } from "../../../../../components/dashboard";

export const metadata: Metadata = { title: "Knowledge" };

export default function KnowledgePage() {
  return <TabPlaceholder tab="knowledge" />;
}
