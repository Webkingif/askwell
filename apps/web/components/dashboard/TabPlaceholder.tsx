import { EmptyState, GlassPanel } from "../ui";
import type { ProjectTab } from "./nav";

const COPY: Record<ProjectTab, { title: string; message: string }> = {
  knowledge: {
    title: "No knowledge yet",
    message:
      "Add text or upload a PDF about your product. The bot answers only from what you add here.",
  },
  conversations: {
    title: "No conversations yet",
    message: "Chats from your widget show up here, newest first.",
  },
  customize: {
    title: "Customize your widget",
    message:
      "Button color, position, label, animation and header text. Coming soon.",
  },
  install: {
    title: "Install the widget",
    message: "Your script tag and a copy button will be here. Coming soon.",
  },
  usage: {
    title: "No usage yet",
    message: "Messages used this month, against your plan's limit.",
  },
};

/** Empty state for a project tab until its feature lands. */
export function TabPlaceholder({ tab }: { tab: ProjectTab }) {
  return (
    <GlassPanel padding="lg">
      <EmptyState {...COPY[tab]} />
    </GlassPanel>
  );
}
