import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseEnv,
  readSupabasePublicEnv,
  secretKeySchema,
} from "../../lib/supabase/env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnop.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
};

describe("readSupabasePublicEnv", () => {
  it("returns the URL and publishable key", () => {
    expect(readSupabasePublicEnv(valid)).toEqual(valid);
  });

  it("names every missing variable in one error", () => {
    expect(() => readSupabasePublicEnv({})).toThrow(
      "Supabase env: NEXT_PUBLIC_SUPABASE_URL is not set; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set",
    );
  });

  it("treats an empty string as missing", () => {
    expect(() =>
      readSupabasePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "" }),
    ).toThrow("NEXT_PUBLIC_SUPABASE_URL is not set");
  });

  it("rejects a URL that isn't http(s)", () => {
    expect(() =>
      readSupabasePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: "not a url",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL /);
    expect(() =>
      readSupabasePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_URL: "ftp://abc.supabase.co",
      }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL /);
  });

  it("refuses a secret key in the public variable", () => {
    expect(() =>
      readSupabasePublicEnv({
        ...valid,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_oops",
      }),
    ).toThrow(/is a secret key/);
  });
});

describe("secretKeySchema", () => {
  const schema = z.object({ KEY: secretKeySchema });

  it("accepts a secret key", () => {
    expect(parseEnv(schema, { KEY: "sb_secret_abc" })).toEqual({
      KEY: "sb_secret_abc",
    });
  });

  it("reports a missing key", () => {
    expect(() => parseEnv(schema, {})).toThrow("KEY is not set");
  });

  it("rejects a publishable key", () => {
    expect(() => parseEnv(schema, { KEY: "sb_publishable_abc" })).toThrow(
      /is a publishable key/,
    );
  });
});
