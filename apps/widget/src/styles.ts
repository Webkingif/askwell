// Every style lives in the shadow root. Nothing here reaches the host page.
import type { WidgetConfig } from "@askwell/shared";
import { textColorFor } from "./config";

/** Panel size on wide screens. Under MOBILE_MAX_WIDTH it fills the screen. */
export const PANEL_WIDTH = 380;
export const PANEL_HEIGHT = 600;
export const MOBILE_MAX_WIDTH = 480;
/** Gap between the button and the viewport edge. */
const EDGE = 20;
/** Button height plus the gap above it. */
const BUTTON_SPACE = 56 + 16;

/** The host element's inline style: shields it from page CSS. */
export const HOST_STYLE =
  "all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;";

export function widgetCss(config: WidgetConfig): string {
  const [v, h] = config.position.split("-") as [
    "top" | "bottom",
    "left" | "right",
  ];
  const bg = config.buttonColor;
  const fg = textColorFor(bg);
  return `
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
.btn{position:fixed;${v}:${EDGE}px;${h}:${EDGE}px;z-index:2;display:inline-flex;align-items:center;gap:8px;height:56px;max-width:calc(100vw - ${EDGE * 2}px);padding:0 20px;margin:0;border:1px solid rgba(255,255,255,.18);border-radius:9999px;background:${bg};color:${fg};font:600 15px/1 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:0;text-transform:none;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.24);transition:transform .15s ease}
.btn:hover{transform:translateY(-1px)}
.btn:focus-visible{outline:2px solid ${fg};outline-offset:-5px}
.btn svg{flex:none;width:20px;height:20px}
.label{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dot{position:absolute;top:2px;${h === "right" ? "left" : "right"}:2px;width:12px;height:12px;border:2px solid #fff;border-radius:50%;background:#ef4444}
.dot[hidden]{display:none}
.panel{position:fixed;${v}:${EDGE + BUTTON_SPACE}px;${h}:${EDGE}px;z-index:1;width:${PANEL_WIDTH}px;height:${PANEL_HEIGHT}px;max-height:calc(100vh - ${EDGE * 2 + BUTTON_SPACE}px);border-radius:16px;overflow:hidden;background:rgba(255,255,255,.85);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);box-shadow:0 16px 48px rgba(0,0,0,.28);opacity:0;visibility:hidden;pointer-events:none;transition:opacity .2s ease,transform .2s ease,visibility 0s linear .2s}
.panel.open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .2s ease,transform .2s ease,visibility 0s}
.anim-slide{transform:translateY(${v === "bottom" ? 24 : -24}px)}
.anim-scale{transform:scale(.9);transform-origin:${v} ${h}}
iframe{display:block;width:100%;height:100%;border:0;background:transparent;color-scheme:normal}
@media (max-width:${MOBILE_MAX_WIDTH - 0.02}px){.panel{inset:0;width:100%!important;height:100%!important;max-height:none;border-radius:0}.panel.open~.btn{display:none}}
@media (prefers-reduced-motion:reduce){.panel,.panel.open,.btn{transition:none}}
`;
}
