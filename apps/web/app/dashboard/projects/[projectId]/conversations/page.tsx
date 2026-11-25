import type { Metadata } from "next";
import { TabPlaceholder } from "../../../../../components/dashboard";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsPage() {
  return <TabPlaceholder tab="conversations" />;
}
