import { GlassPanel, LoadingState } from "../../components/ui";

export default function DashboardLoading() {
  return (
    <GlassPanel padding="lg">
      <LoadingState title="Loading" />
    </GlassPanel>
  );
}
