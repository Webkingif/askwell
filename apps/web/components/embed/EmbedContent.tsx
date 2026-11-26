// Server component: loads the config for `?key=` and shows the panel, or the
// unavailable state. Reads nothing but the public widget config (§9).
import { widgetConfigQuerySchema } from "@askwell/shared";
import { getWidgetConfigByKey } from "../../lib/widget-config";
import { ChatPanel, EmbedUnavailable } from "./ChatPanel";

export type EmbedSearchParams = Record<string, string | string[] | undefined>;

export async function EmbedContent({
  searchParams,
}: {
  searchParams: Promise<EmbedSearchParams>;
}) {
  const { key } = await searchParams;
  // A malformed key, an unknown key and a failed read look the same.
  const query = widgetConfigQuerySchema.safeParse({
    key: typeof key === "string" ? key : "",
  });
  if (!query.success) return <EmbedUnavailable />;

  let config;
  try {
    config = await getWidgetConfigByKey(query.data.key);
  } catch (error) {
    console.error(error);
    return <EmbedUnavailable />;
  }
  if (!config) return <EmbedUnavailable />;
  return <ChatPanel config={config} publicKey={query.data.key} />;
}
