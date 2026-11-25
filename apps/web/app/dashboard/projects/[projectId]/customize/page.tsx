import type { Metadata } from "next";
import { TabPlaceholder } from "../../../../../components/dashboard";

export const metadata: Metadata = { title: "Customize" };

export default function CustomizePage() {
  return <TabPlaceholder tab="customize" />;
}
