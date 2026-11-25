import { APP_NAME } from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home from "../app/page";

describe("home page", () => {
  it("shows APP_NAME from @askwell/shared", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain(`<h1`);
    expect(html).toContain(APP_NAME);
  });
});
