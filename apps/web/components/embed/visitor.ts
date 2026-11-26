// The visitor's random ID (project.md §6.5 Panel). It lives in the iframe's
// localStorage (the app origin), never on the host page, and is reused
// across visits. Storage can be missing or throw (Safari third-party
// iframes, private mode), so it falls back to an ID kept in memory.
import { VISITOR_ID_STORAGE_KEY } from "@askwell/shared";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type VisitorStorage = Pick<Storage, "getItem" | "setItem">;

let memoryId: string | null = null;

function newId(): string {
  return crypto.randomUUID();
}

/** The stored visitor ID, or a new one (saved when storage works). */
export function getVisitorId(storage: VisitorStorage | null): string {
  try {
    if (storage) {
      const saved = storage.getItem(VISITOR_ID_STORAGE_KEY);
      if (saved && UUID.test(saved)) return saved;
      const id = newId();
      storage.setItem(VISITOR_ID_STORAGE_KEY, id);
      return id;
    }
  } catch {
    // Fall through to the in-memory ID.
  }
  memoryId ??= newId();
  return memoryId;
}

/** `window.localStorage`, or null where reading it throws. */
export function browserStorage(): VisitorStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Test helper: forget the in-memory fallback ID. */
export function resetMemoryVisitorId(): void {
  memoryId = null;
}
