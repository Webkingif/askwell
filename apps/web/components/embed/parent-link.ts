// postMessage between the panel and the loader on the host page
// (B1 contract in packages/shared/src/embed.ts, project.md §9).
//
// The panel doesn't know the host page's origin in advance. It learns it
// from the first valid loader message (`askwell:opened`) that comes from
// `window.parent`, and from then on posts only to that origin. Before that,
// it posts nothing. Never "*".
import {
  isLoaderToPanelMessage,
  type LoaderToPanelMessage,
  type PanelToLoaderMessage,
} from "@askwell/shared";

/** The bits of `window` this needs, so tests can pass a fake. */
export interface LinkWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: "message", listener: (e: MessageEvent) => void): void;
  removeEventListener(
    type: "message",
    listener: (e: MessageEvent) => void,
  ): void;
}

export interface ParentLink {
  /** The host page's origin, once the loader has said hello. */
  readonly parentOrigin: string | null;
  /** Posts to the host page. Returns false (and sends nothing) before the handshake. */
  send(message: PanelToLoaderMessage): boolean;
  stop(): void;
}

export function connectToParent(
  win: LinkWindow,
  onMessage: (message: LoaderToPanelMessage) => void,
): ParentLink {
  let parentOrigin: string | null = null;

  const listener = (event: MessageEvent) => {
    if (event.source !== (win.parent as unknown)) return;
    if (!isLoaderToPanelMessage(event.data)) return;
    // Keep the first origin: the parent can't change without reloading us.
    if (parentOrigin === null) {
      if (!event.origin || event.origin === "null") return;
      parentOrigin = event.origin;
    } else if (event.origin !== parentOrigin) {
      return;
    }
    onMessage(event.data);
  };
  win.addEventListener("message", listener);

  return {
    get parentOrigin() {
      return parentOrigin;
    },
    send(message) {
      if (parentOrigin === null) return false;
      win.parent.postMessage(message, parentOrigin);
      return true;
    },
    stop() {
      win.removeEventListener("message", listener);
    },
  };
}
