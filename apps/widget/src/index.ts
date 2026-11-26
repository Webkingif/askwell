// The loader: runs on the customer's page from widget.js (project.md §6.5).
// It renders the chat button in a closed shadow root and opens /embed in an
// iframe. It must never break or restyle the host page, so:
// - all DOM lives in one host element, all CSS in its shadow root;
// - any failure (bad key, bad config) renders nothing;
// - postMessage checks origin and source, and never targets "*" (§9).
import {
  APP_NAME,
  PUBLIC_KEY_PATTERN,
  embedUrl,
  isPanelToLoaderMessage,
  type LoaderToPanelMessage,
  type WidgetConfig,
} from "@askwell/shared";
import { fetchConfig } from "./config";
import { HOST_STYLE, widgetCss } from "./styles";

/** Set on `window` while a loader runs, so a second copy does nothing. */
const BOOTED = Symbol.for("askwell.widget");
const HOST_TAG = "askwell-widget";
const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * The panel may not be listening yet when the iframe's `load` fires (React
 * hydrates after it), so `askwell:opened` is re-sent until the panel answers
 * with any valid message (it acks with `askwell:resize`), or gives up.
 */
export const HANDSHAKE_INTERVAL_MS = 200;
export const HANDSHAKE_TIMEOUT_MS = 5000;

export interface Widget {
  host: HTMLElement;
  root: ShadowRoot;
  button: HTMLButtonElement;
  panel: HTMLDivElement;
  /** Created on first open, then kept so the conversation survives a close. */
  readonly iframe: HTMLIFrameElement | null;
  readonly isOpen: boolean;
  open(): void;
  close(): void;
  /** Removes everything this loader added, listeners included. */
  destroy(): void;
}

export interface BootOptions {
  /** The widget.js script tag. Default: the current script, or a lookup. */
  script?: HTMLScriptElement | null;
  fetch?: typeof fetch;
}

function debug(reason: string): void {
  console.debug(`${APP_NAME} widget: ${reason}`);
}

/** The `<script src=".../widget.js" data-key>` tag that loaded us. */
export function findScript(doc: Document): HTMLScriptElement | null {
  const current = doc.currentScript;
  if (current instanceof HTMLScriptElement && current.dataset.key) {
    return current;
  }
  return doc.querySelector<HTMLScriptElement>(
    'script[data-key][src*="widget.js"]',
  );
}

function bodyReady(doc: Document): Promise<HTMLElement> {
  if (doc.body) return Promise.resolve(doc.body);
  return new Promise((resolve) => {
    doc.addEventListener("DOMContentLoaded", () => resolve(doc.body), {
      once: true,
    });
  });
}

function chatIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute(
    "d",
    "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  );
  svg.appendChild(path);
  return svg;
}

/** Builds the button and panel. Only text and attributes, never HTML strings. */
export function render(
  doc: Document,
  body: HTMLElement,
  config: WidgetConfig,
  origin: string,
  key: string,
): Widget {
  const win = doc.defaultView as Window;
  const host = doc.createElement(HOST_TAG);
  host.setAttribute("style", HOST_STYLE);
  const root = host.attachShadow({ mode: "closed" });

  const style = doc.createElement("style");
  style.textContent = widgetCss(config);

  // The panel comes first so CSS can hide the button behind a full-screen panel.
  const panel = doc.createElement("div");
  panel.className = `panel anim-${config.animation}`;
  panel.id = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", config.headerText || config.label);

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "btn";
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "panel");
  const label = doc.createElement("span");
  label.className = "label";
  label.textContent = config.label;
  const dot = doc.createElement("span");
  dot.className = "dot";
  dot.hidden = true;
  button.append(chatIcon(doc), label, dot);

  root.append(style, panel, button);
  body.appendChild(host);

  let iframe: HTMLIFrameElement | null = null;
  let isOpen = false;
  let retryTimer: ReturnType<typeof setInterval> | null = null;
  let giveUpTimer: ReturnType<typeof setTimeout> | null = null;

  const post = (msg: LoaderToPanelMessage) => {
    // Target the app origin, never "*". If the frame navigated elsewhere,
    // the browser drops the message.
    iframe?.contentWindow?.postMessage(msg, origin);
  };

  const stopHandshake = () => {
    if (retryTimer !== null) clearInterval(retryTimer);
    if (giveUpTimer !== null) clearTimeout(giveUpTimer);
    retryTimer = giveUpTimer = null;
  };

  /** Sends `opened` now, then every interval until acked, closed or timed out. */
  const startHandshake = () => {
    stopHandshake();
    post({ type: "askwell:opened" });
    retryTimer = setInterval(
      () => post({ type: "askwell:opened" }),
      HANDSHAKE_INTERVAL_MS,
    );
    giveUpTimer = setTimeout(stopHandshake, HANDSHAKE_TIMEOUT_MS);
  };

  const setUnread = (count: number) => {
    dot.hidden = count === 0 || isOpen;
    button.setAttribute(
      "aria-label",
      count > 0 && !isOpen ? `${config.label} (${count} unread)` : config.label,
    );
  };

  const open = () => {
    if (isOpen) return;
    if (!iframe) {
      iframe = doc.createElement("iframe");
      iframe.src = embedUrl(origin, key);
      iframe.title = config.headerText || config.label;
      iframe.setAttribute("allow", "clipboard-write");
      iframe.addEventListener("load", () => {
        if (isOpen) startHandshake();
      });
      panel.appendChild(iframe);
      isOpen = true;
    } else {
      isOpen = true;
      startHandshake();
    }
    panel.classList.add("open");
    button.setAttribute("aria-expanded", "true");
    setUnread(0);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    stopHandshake();
    panel.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
  };

  const onMessage = (event: MessageEvent) => {
    if (event.origin !== origin) return;
    if (!iframe || event.source !== iframe.contentWindow) return;
    const msg: unknown = event.data;
    if (!isPanelToLoaderMessage(msg)) return;
    // Any valid message from our panel means it's listening.
    stopHandshake();
    switch (msg.type) {
      case "askwell:close":
        close();
        break;
      case "askwell:resize":
        // CSS max-height keeps it on screen; mobile ignores it (full screen).
        panel.style.height = `${Math.round(msg.height)}px`;
        break;
      case "askwell:unread":
        setUnread(msg.count);
        break;
    }
  };

  button.addEventListener("click", () => (isOpen ? close() : open()));
  win.addEventListener("message", onMessage);
  setUnread(0);

  return {
    host,
    root,
    button,
    panel,
    get iframe() {
      return iframe;
    },
    get isOpen() {
      return isOpen;
    },
    open,
    close,
    destroy() {
      stopHandshake();
      win.removeEventListener("message", onMessage);
      host.remove();
    },
  };
}

type BootedWindow = Window & { [BOOTED]?: true };

/**
 * Starts the loader. Resolves to the widget, or null when nothing renders
 * (bad key, bad script src, config failure, or already loaded).
 */
export async function boot(options: BootOptions = {}): Promise<Widget | null> {
  const doc = document;
  const win = window as BootedWindow;
  if (win[BOOTED]) return null;

  const script =
    options.script === undefined ? findScript(doc) : options.script;
  const key = script?.dataset.key ?? "";
  if (!script || !PUBLIC_KEY_PATTERN.test(key)) {
    debug("missing or invalid data-key");
    return null;
  }
  let origin: string;
  try {
    origin = new URL(script.src).origin;
  } catch {
    debug("invalid script src");
    return null;
  }
  if (origin === "null") {
    debug("invalid script src");
    return null;
  }

  // Claim the page before any await, so a second copy stops above.
  win[BOOTED] = true;
  let config: WidgetConfig;
  try {
    config = await fetchConfig(origin, key, options.fetch ?? fetch);
  } catch {
    debug("config unavailable");
    return null;
  }
  const body = await bodyReady(doc);
  return render(doc, body, config, origin, key);
}

/** Test helper: lets boot() run again in the same window. */
export function resetBootFlag(): void {
  delete (window as BootedWindow)[BOOTED];
}
