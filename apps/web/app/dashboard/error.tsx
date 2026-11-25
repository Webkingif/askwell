"use client";

import { useEffect } from "react";
import { Button, ErrorState, GlassPanel } from "../../components/ui";

export default function DashboardError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error &&
    "digest" in error &&
    typeof error.digest === "string"
      ? error.digest
      : undefined;

  return (
    <GlassPanel padding="lg">
      <ErrorState
        title="Something went wrong"
        message={
          digest
            ? `This page couldn't load. Try again. (Reference: ${digest})`
            : "This page couldn't load. Try again."
        }
        action={
          <Button variant="secondary" onClick={() => retry()}>
            Try again
          </Button>
        }
      />
    </GlassPanel>
  );
}
