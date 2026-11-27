import Link from "next/link";
import { ErrorState, GlassPanel } from "../../../../../components/ui";
import { DASHBOARD_PATH } from "../../../../../lib/auth/routes";

/** A missing conversation, or one this owner can't see (RLS). */
export default function ConversationNotFound() {
  return (
    <GlassPanel padding="lg">
      <ErrorState
        title="Conversation not found"
        message="It may belong to another project or account."
        action={
          <Link
            href={DASHBOARD_PATH}
            className="focus-ring glass inline-flex h-10 items-center rounded-md px-4 text-sm font-medium text-fg hover:bg-subtle"
          >
            Back to projects
          </Link>
        }
      />
    </GlassPanel>
  );
}
