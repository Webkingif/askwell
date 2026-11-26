import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatPanel } from "../../components/embed";
import {
  initialChatState,
  type ChatState,
} from "../../components/embed/chat-state";

const KEY = "pk_test_0123456789abcdef";
const XSS = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;

function render(config: Partial<WidgetConfig> = {}, state?: ChatState) {
  return renderToStaticMarkup(
    <ChatPanel
      config={{ ...DEFAULT_WIDGET_CONFIG, ...config }}
      publicKey={KEY}
      initialState={state}
    />,
  );
}

describe("ChatPanel", () => {
  it("shows the header, the input and the empty state", () => {
    const html = render({ headerText: "Need help?" });
    expect(html).toContain("Need help?");
    expect(html).toContain('id="embed-message"');
    expect(html).toContain('maxLength="1000"');
    expect(html).toContain("Hi! How can we help?");
  });

  it("renders HTML in messages as literal text", () => {
    const html = render(
      {},
      {
        ...initialChatState,
        messages: [
          { id: "1", role: "visitor", text: XSS },
          { id: "2", role: "bot", text: XSS },
        ],
      },
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html.split("&lt;script&gt;alert(2)&lt;/script&gt;")).toHaveLength(3);
  });

  it("renders the header text as text", () => {
    const html = render({ headerText: "<b>Hi</b>" });
    expect(html).toContain("&lt;b&gt;Hi&lt;/b&gt;");
    expect(html).not.toContain("<b>");
  });

  it("shows the Powered by badge when config.showBadge", () => {
    const html = render({ showBadge: true });
    expect(html).toContain('data-testid="powered-by"');
    expect(html).toMatch(/Powered by <span[^>]*>Askwell<\/span>/);
  });

  it("hides the badge when config.showBadge is false", () => {
    expect(render({ showBadge: false })).not.toContain("Powered by");
  });

  it("shows the typing state while waiting for a reply", () => {
    const html = render(
      {},
      {
        ...initialChatState,
        messages: [{ id: "1", role: "visitor", text: "hello" }],
        typing: true,
      },
    );
    expect(html).toContain("Typing…");
    expect(html).toContain("hello");
  });

  it("shows no close button before the loader's handshake", () => {
    expect(render()).not.toContain("Close chat");
  });
});
