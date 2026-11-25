import { describe, expectTypeOf, it } from "vitest";
import type { Database, Tables, TablesInsert } from "../src/index";

describe("Database types", () => {
  it("describe the tables", () => {
    expectTypeOf<Tables<"projects">["public_key"]>().toEqualTypeOf<string>();
    expectTypeOf<Tables<"knowledge_sources">["storage_key"]>().toEqualTypeOf<
      string | null
    >();
    expectTypeOf<keyof Database["public"]["Tables"]>().toEqualTypeOf<
      | "accounts"
      | "projects"
      | "widget_configs"
      | "knowledge_sources"
      | "knowledge_chunks"
      | "conversations"
      | "messages"
    >();
    // Defaults make these optional on insert.
    expectTypeOf<TablesInsert<"widget_configs">>().toEqualTypeOf<{
      animation?: string;
      button_color?: string;
      header_text?: string;
      label?: string;
      position?: string;
      project_id: string;
      show_badge?: boolean;
    }>();
  });
});
