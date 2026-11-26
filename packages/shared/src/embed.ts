// The postMessage contract between the loader (apps/widget, on the customer's
// page) and the panel (/embed, in the iframe). project.md §6.5, §9.
// No zod here: the widget bundle imports this.
//
// Rules for both sides (§9):
// - Check `event.origin` on every message. The loader accepts only the app
//   origin. The panel accepts only messages whose `event.source` is
//   `window.parent`.
// - Never post data with target origin `*`. The loader posts to the app
//   origin. The panel learns the host origin from the `event.origin` of the
//   loader's `askwell:opened` and posts only to that origin.
// - Run every `event.data` through the guards below before using it.

/** The panel's path in the web app. */
export const EMBED_PATH = "/embed";

/**
 * The panel URL the loader opens in its iframe, e.g.
 * `https://app.example.com/embed?key=pk_...`. A trailing slash on
 * `appOrigin` is ignored, and the key is URL-encoded.
 */
export function embedUrl(appOrigin: string, key: string): string {
  return `${appOrigin.replace(/\/+$/, "")}${EMBED_PATH}?key=${encodeURIComponent(key)}`;
}

/**
 * Every message type starts with this, so other postMessage traffic on the
 * host page is ignored. It's a wire value and must stay the same if the
 * product is renamed, so it doesn't come from APP_NAME.
 */
export const EMBED_MESSAGE_PREFIX = "askwell:";

/** Panel → loader. */
export type PanelToLoaderMessage =
  /** The visitor closed the panel. */
  | { type: "askwell:close" }
  /** The panel's content height in CSS pixels (finite, > 0). */
  | { type: "askwell:resize"; height: number }
  /** Unread bot replies while the panel is hidden (integer, ≥ 0; 0 clears). */
  | { type: "askwell:unread"; count: number };

/** Loader → panel. */
export type LoaderToPanelMessage =
  /**
   * The panel is showing. The loader sends it on iframe load and each time
   * it opens the panel. Its `event.origin` tells the panel where to post.
   */
  { type: "askwell:opened" };

/**
 * `localStorage` key for the visitor ID. The panel stores it in the iframe's
 * storage (the app origin), never on the host page.
 */
export const VISITOR_ID_STORAGE_KEY = "askwell:visitorId";

function isRecord(data: unknown): data is Record<string, unknown> {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}

function isPositiveFinite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
}

/**
 * True if `data` is a valid panel → loader message. Extra fields are
 * ignored, so an older loader still accepts a newer panel's messages.
 */
export function isPanelToLoaderMessage(
  data: unknown,
): data is PanelToLoaderMessage {
  if (!isRecord(data)) return false;
  switch (data.type) {
    case "askwell:close":
      return true;
    case "askwell:resize":
      return isPositiveFinite(data.height);
    case "askwell:unread":
      return isCount(data.count);
    default:
      return false;
  }
}

/** True if `data` is a valid loader → panel message. Extra fields are ignored. */
export function isLoaderToPanelMessage(
  data: unknown,
): data is LoaderToPanelMessage {
  return isRecord(data) && data.type === "askwell:opened";
}
