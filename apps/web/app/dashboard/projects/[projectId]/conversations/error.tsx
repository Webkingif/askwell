"use client";

import { useEffect } from "react";
import { Button, ErrorState, GlassPanel } from "../../../../../components/ui";

export default function ConversationsError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <GlassPanel padding="lg">
      <ErrorState
        title="We couldn't load your conversations"
        message="Something went wrong on our side. Try again in a moment."
        action={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </GlassPanel>
  );
}
