// Reads GET /api/widget/config. No zod here: it would bloat widget.js, so the
// body is checked by hand against the shared WidgetConfig shape.
import {
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type WidgetConfig,
  type WidgetConfigResponse,
} from "@askwell/shared";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isOneOf<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

/** The config inside a WidgetConfigResponse body, or null if the body is wrong. */
export function parseConfigResponse(body: unknown): WidgetConfig | null {
  if (typeof body !== "object" || body === null) return null;
  const c = (body as Partial<Record<keyof WidgetConfigResponse, unknown>>)
    .config;
  if (typeof c !== "object" || c === null) return null;
  const r = c as Record<keyof WidgetConfig, unknown>;
  if (
    typeof r.buttonColor !== "string" ||
    !HEX_COLOR.test(r.buttonColor) ||
    !isOneOf(WIDGET_POSITIONS, r.position) ||
    typeof r.label !== "string" ||
    !isOneOf(WIDGET_ANIMATIONS, r.animation) ||
    typeof r.headerText !== "string" ||
    typeof r.showBadge !== "boolean"
  ) {
    return null;
  }
  return {
    buttonColor: r.buttonColor,
    position: r.position,
    label: r.label,
    animation: r.animation,
    headerText: r.headerText,
    showBadge: r.showBadge,
  };
}

/** The URL of the public config route on the app origin. */
export function configUrl(origin: string, key: string): string {
  return `${origin}/api/widget/config?key=${encodeURIComponent(key)}`;
}

/** Fetches and checks the config. Throws on a network error, non-200 or bad body. */
export async function fetchConfig(
  origin: string,
  key: string,
  fetchFn: typeof fetch,
): Promise<WidgetConfig> {
  const res = await fetchFn(configUrl(origin, key), {
    credentials: "omit",
    headers: { accept: "application/json" },
  });
  if (res.status !== 200) throw new Error(`config ${res.status}`);
  const config = parseConfigResponse(await res.json());
  if (!config) throw new Error("config body");
  return config;
}

/** Black or white text, whichever reads better on `hex` (#rrggbb). */
export function textColorFor(hex: string): "#000000" | "#ffffff" {
  const n = parseInt(hex.slice(1), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  // Pick the higher WCAG contrast: (1.05) / (l + 0.05) vs (l + 0.05) / 0.05.
  return l > 0.179 ? "#000000" : "#ffffff";
}
