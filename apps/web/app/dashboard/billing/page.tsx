import type { Metadata } from "next";
import { PageHeader } from "../../../components/dashboard";
import { EmptyState, GlassPanel } from "../../../components/ui";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return (
    <>
      <PageHeader title="Billing" description="Your plan and subscription." />
      <GlassPanel padding="lg">
        <EmptyState
          title="Plans are coming soon"
          message="You're on the Free plan. Upgrading to Pro will happen here."
        />
      </GlassPanel>
    </>
  );
}
