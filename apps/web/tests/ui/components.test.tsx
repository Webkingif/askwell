import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  GlassPanel,
  Input,
  LoadingState,
  Spinner,
  cx,
} from "../../components/ui";

describe("cx", () => {
  it("joins truthy class names", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });
});

describe("Button", () => {
  it("defaults to a primary, non-submit button", () => {
    const html = renderToStaticMarkup(<Button>Save</Button>);
    expect(html).toContain('type="button"');
    expect(html).toContain("bg-accent");
    expect(html).toContain("focus-ring");
    expect(html).not.toContain('disabled=""');
    expect(html).not.toContain("aria-busy");
  });

  it("applies variant and size", () => {
    const html = renderToStaticMarkup(
      <Button variant="ghost" size="lg">
        Go
      </Button>,
    );
    expect(html).toContain("hover:bg-subtle");
    expect(html).toContain("h-12");
    expect(html).not.toContain("bg-accent");
  });

  it("is disabled and aria-busy while loading, with a spinner", () => {
    const html = renderToStaticMarkup(<Button loading>Saving</Button>);
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("animate-spin");
    expect(html).toContain("Saving");
  });

  it("can be disabled", () => {
    const html = renderToStaticMarkup(<Button disabled>No</Button>);
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});

describe("Input", () => {
  it("links its label to the input", () => {
    const html = renderToStaticMarkup(<Input id="name" label="Name" />);
    expect(html).toContain('for="name"');
    expect(html).toContain('id="name"');
  });

  it("marks errors as invalid and describes the input", () => {
    const html = renderToStaticMarkup(
      <Input id="url" label="URL" hint="Full URL" error="Bad URL" />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="url-hint url-error"');
    expect(html).toContain("Bad URL");
  });

  it("can hide its label visually", () => {
    const html = renderToStaticMarkup(<Input label="Search" hideLabel />);
    expect(html).toContain("sr-only");
    expect(html).toContain("Search");
  });
});

describe("Badge", () => {
  it("renders its variant", () => {
    expect(renderToStaticMarkup(<Badge variant="solid">Pro</Badge>)).toContain(
      "bg-accent",
    );
  });
});

describe("Spinner", () => {
  it("announces a label by default", () => {
    const html = renderToStaticMarkup(<Spinner />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading");
  });

  it("is silent with label null", () => {
    const html = renderToStaticMarkup(<Spinner label={null} />);
    expect(html).not.toContain("role=");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("GlassPanel", () => {
  it("uses the glass token utility and the chosen element", () => {
    const html = renderToStaticMarkup(<GlassPanel as="section">Hi</GlassPanel>);
    expect(html).toMatch(/^<section[^>]*class="[^"]*\bglass\b/);
  });

  it("uses the strong glass when asked", () => {
    expect(renderToStaticMarkup(<GlassPanel strong />)).toContain(
      "glass-strong",
    );
  });
});

describe("state components", () => {
  it("EmptyState shows title, message and action", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        title="Nothing here"
        message="Add one"
        action={<Button>Add</Button>}
      />,
    );
    expect(html).toContain("Nothing here");
    expect(html).toContain("Add one");
    expect(html).toContain("<button");
  });

  it("LoadingState is a busy live region with a spinner", () => {
    const html = renderToStaticMarkup(<LoadingState title="Loading" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("animate-spin");
  });

  it("ErrorState is an alert and shows its action", () => {
    const html = renderToStaticMarkup(
      <ErrorState
        title="Failed"
        message="Try again later"
        action={<Button>Retry</Button>}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Failed");
    expect(html).toContain("Retry</button>");
  });

  it("omits optional parts when not given", () => {
    const html = renderToStaticMarkup(<ErrorState title="Failed" />);
    expect(html).not.toContain("<p");
    expect(html).not.toContain("<button");
  });
});
