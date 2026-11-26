import {
  DEFAULT_WIDGET_CONFIG,
  PLAN_LIMITS,
  PUBLIC_KEY_PATTERN,
} from "@askwell/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSupabasePglite, type SupabasePglite } from "../supabase-pglite";
import { count } from "./fixtures";

let sb: SupabasePglite;

const FREE = "user_free";
const PRO = "user_pro";

interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  public_key: string;
  messages_used: number;
}

const CALL = "select * from public.create_project($1, $2, $3)";

beforeAll(async () => {
  sb = await createSupabasePglite();
  await sb.db.query(
    "insert into public.accounts (clerk_user_id, plan) values ($1, 'free'), ($2, 'pro')",
    [FREE, PRO],
  );
});

afterAll(async () => {
  await sb.close();
});

const create = (owner: string, name: string, max: number | null) =>
  sb.asRole("service_role").query<ProjectRow>(CALL, [owner, name, max]);

describe("create_project", () => {
  it("creates the project and its default widget config", async () => {
    const { rows } = await create(FREE, "My site", PLAN_LIMITS.free.projects);
    expect(rows).toHaveLength(1);
    const project = rows[0]!;
    expect(project).toMatchObject({
      owner_id: FREE,
      name: "My site",
      messages_used: 0,
    });

    const config = await sb.db.query<Record<string, unknown>>(
      "select button_color, position, label, animation, header_text, show_badge from public.widget_configs where project_id = $1",
      [project.id],
    );
    expect(config.rows).toHaveLength(1);
    expect(config.rows[0]).toEqual({
      button_color: DEFAULT_WIDGET_CONFIG.buttonColor,
      position: DEFAULT_WIDGET_CONFIG.position,
      label: DEFAULT_WIDGET_CONFIG.label,
      animation: DEFAULT_WIDGET_CONFIG.animation,
      header_text: DEFAULT_WIDGET_CONFIG.headerText,
      show_badge: DEFAULT_WIDGET_CONFIG.showBadge,
    });
  });

  it("generates a unique public key matching PUBLIC_KEY_PATTERN", async () => {
    const keys = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const { rows } = await create(PRO, `Site ${i}`, PLAN_LIMITS.pro.projects);
      const key = rows[0]!.public_key;
      expect(key).toMatch(PUBLIC_KEY_PATTERN);
      keys.add(key);
    }
    expect(keys.size).toBe(5);
  });

  it("refuses at the limit with project_limit and writes nothing", async () => {
    const before = await count(sb, "projects", `owner_id = '${FREE}'`);
    expect(before).toBe(PLAN_LIMITS.free.projects);

    await expect(
      create(FREE, "Second", PLAN_LIMITS.free.projects),
    ).rejects.toMatchObject({ code: "P0001", message: "project_limit" });
    await expect(
      create(PRO, "Sixth", PLAN_LIMITS.pro.projects),
    ).rejects.toMatchObject({ code: "P0001", message: "project_limit" });

    expect(await count(sb, "projects", `owner_id = '${FREE}'`)).toBe(before);
    expect(await count(sb, "widget_configs")).toBe(await count(sb, "projects"));
  });

  it("allows more once the caller passes a higher limit (plan from the server)", async () => {
    const { rows } = await create(
      FREE,
      "After upgrade",
      PLAN_LIMITS.pro.projects,
    );
    expect(rows).toHaveLength(1);
  });

  it("fails cleanly when the account row is missing", async () => {
    await expect(create("user_missing", "X", 1)).rejects.toMatchObject({
      code: "P0002",
      message: "account_not_found",
    });
    expect(await count(sb, "projects", "owner_id = 'user_missing'")).toBe(0);
  });

  it("rejects a null or negative limit", async () => {
    for (const max of [null, -1]) {
      await expect(create(PRO, "X", max)).rejects.toMatchObject({
        code: "22023",
        message: "invalid_limit",
      });
    }
  });

  it("rejects an invalid name via the table check", async () => {
    await expect(create(PRO, "", 100)).rejects.toMatchObject({
      code: "23514",
    });
  });

  it.each(["anon", "authenticated"] as const)(
    "%s cannot execute it",
    async (role) => {
      await expect(
        sb.asRole(role, { sub: FREE }).query(CALL, [FREE, "X", 100]),
      ).rejects.toThrow(/permission denied for function create_project/);
    },
  );

  it("is SECURITY INVOKER with an empty search_path, executable only by service_role", async () => {
    const { rows } = await sb.db.query<{
      prosecdef: boolean;
      proconfig: string[] | null;
      anon: boolean;
      authenticated: boolean;
      service_role: boolean;
      public: boolean;
    }>(`
      select p.prosecdef, p.proconfig,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
        has_function_privilege('service_role', p.oid, 'execute') as service_role,
        exists (
          select 1 from aclexplode(p.proacl) a
          where a.grantee = 0 and a.privilege_type = 'EXECUTE'
        ) as public
      from pg_proc p
      where p.oid = 'public.create_project(text, text, integer)'::regprocedure
    `);
    expect(rows[0]).toEqual({
      prosecdef: false,
      proconfig: ['search_path=""'],
      anon: false,
      authenticated: false,
      service_role: true,
      public: false,
    });
  });
});
