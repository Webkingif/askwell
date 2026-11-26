import { describe, expect, it } from "vitest";
import { PUBLIC_KEY_PATTERN } from "@askwell/shared";
import { appOrigin, buildSnippet } from "../../../components/install/snippet";

const KEY = "pk_2abf182326fc4072a741ff49131f5dcf";
const noHost = { host: null, proto: null };

describe("buildSnippet", () => {
  it("is the documented script tag with the project's key", () => {
    expect(KEY).toMatch(PUBLIC_KEY_PATTERN);
    expect(buildSnippet("https://app.example.com", KEY)).toBe(
      `<script src="https://app.example.com/widget.js" data-key="${KEY}" async></script>`,
    );
  });
});

describe("appOrigin", () => {
  it("uses NEXT_PUBLIC_APP_URL when set, as an origin (no path or trailing slash)", () => {
    expect(
      appOrigin(
        {
          NEXT_PUBLIC_APP_URL: "https://askwell.example.com/",
          VERCEL_URL: "askwell-abc123.vercel.app",
        },
        { host: "localhost:3000", proto: "http" },
      ),
    ).toBe("https://askwell.example.com");
    expect(
      appOrigin({ NEXT_PUBLIC_APP_URL: " https://a.example.com/x/y " }, noHost),
    ).toBe("https://a.example.com");
  });

  it("falls back to this Vercel deployment over https", () => {
    expect(
      appOrigin(
        {
          NEXT_PUBLIC_APP_URL: "",
          VERCEL_URL: "askwell-abc123-team.vercel.app",
        },
        { host: "askwell-git-branch-team.vercel.app", proto: "https" },
      ),
    ).toBe("https://askwell-abc123-team.vercel.app");
  });

  it("ignores an invalid NEXT_PUBLIC_APP_URL", () => {
    expect(
      appOrigin(
        { NEXT_PUBLIC_APP_URL: "not a url", VERCEL_URL: "d.vercel.app" },
        noHost,
      ),
    ).toBe("https://d.vercel.app");
    expect(
      appOrigin(
        { NEXT_PUBLIC_APP_URL: "javascript:alert(1)" },
        {
          host: "localhost:3000",
          proto: null,
        },
      ),
    ).toBe("http://localhost:3000");
  });

  it("uses the request host locally", () => {
    expect(appOrigin({}, { host: "localhost:3000", proto: null })).toBe(
      "http://localhost:3000",
    );
    expect(
      appOrigin({}, { host: "dev.example.com, proxy", proto: "https, http" }),
    ).toBe("https://dev.example.com");
  });

  it("has a last-resort default", () => {
    expect(appOrigin({}, noHost)).toBe("http://localhost:3000");
  });
});
