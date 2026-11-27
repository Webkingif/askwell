"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "../ui";

/** Re-reads the page's server data. Conversations have no realtime (§6.7). */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      Refresh
    </Button>
  );
}
