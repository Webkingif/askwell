import {
  APP_NAME,
  PLAN_LIMITS,
  PLAN_PRICES,
  PLANS,
  PUBLIC_KEY_PREFIX,
} from "@askwell/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home, { metadata } from "../app/page";

const html = renderToStaticMarkup(<Home />);

describe("home page", () => {
  it("shows APP_NAME in the h1 and the metadata", () => {
    expect(html).toMatch(new RegExp(`<h1[^>]*>${APP_NAME}`));
    expect(String(metadata.title)).toContain(APP_NAME);
    expect(String(metadata.description)).toContain(APP_NAME);
  });

  it("renders every section on a dark surface", () => {
    expect(html).toContain("surface-dark");
    for (const id of ["how-it-works", "demo", "pricing", "install"]) {
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toContain("<footer");
  });

  it("links Start free to /sign-up", () => {
    const ctas = [
      ...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>Start free<\/a>/g),
    ];
    expect(ctas.length).toBeGreaterThan(0);
    for (const [, href] of ctas) expect(href).toBe("/sign-up");
  });

  it("shows pricing values from PLAN_LIMITS and PLAN_PRICES", () => {
    const pricing = html.slice(
      html.indexOf('id="pricing"'),
      html.indexOf('id="install"'),
    );
    for (const plan of PLANS) {
      const display = PLAN_PRICES[plan].display;
      expect(pricing).toContain(display.slice(0, display.indexOf("/")));
      const l = PLAN_LIMITS[plan];
      for (const n of [l.projects, l.messagesPerMonth, l.knowledgeSources]) {
        expect(pricing).toContain(`>${n.toLocaleString("en-US")}<`);
      }
    }
  });

  it("marks the demo as a non-interactive preview", () => {
    const demo = html.slice(
      html.indexOf('id="demo"'),
      html.indexOf('id="pricing"'),
    );
    expect(demo).toContain("Preview");
    expect(demo).toContain("inert");
    expect(demo).toContain(`Powered by ${APP_NAME}`);
  });

  it("shows the install snippet as text", () => {
    expect(html).toContain(
      `&lt;script src=&quot;.../widget.js&quot; data-key=&quot;${PUBLIC_KEY_PREFIX}...&quot;&gt;&lt;/script&gt;`,
    );
  });
});
