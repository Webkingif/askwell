import { GlassPanel, LoadingState } from "../../../../../components/ui";

export default function ConversationsLoading() {
  return (
    <GlassPanel padding="lg">
      <LoadingState title="Loading conversations" />
    </GlassPanel>
  );
}
