import { APP_NAME } from "@askwell/shared";

// Stub. The real loader (button, iframe, postMessage) arrives in Phase 2.

export function bootMessage(): string {
  return `${APP_NAME} widget stub loaded`;
}

export function boot(): void {
  console.debug(bootMessage());
}
