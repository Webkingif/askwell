import { describe, expect, it } from "vitest";
import { PLAN_LIMITS } from "@askwell/shared";
import { currentUsage } from "../../lib/usage";

const NOW = new Date("2026-11-27T15:00:00Z");
const NOV = "2026-11-01T00:00:00+00:00";
const OCT = "2026-10-01T00:00:00+00:00";

describe("currentUsage", () => {
  it("counts this month's messages against the free limit", () => {
    expect(
      currentUsage({ messagesUsed: 42, periodStart: NOV }, "free", NOW),
    ).toEqual({
      used: 42,
      limit: PLAN_LIMITS.free.messagesPerMonth,
      resetsAt: "2026-12-01T00:00:00.000Z",
      atLimit: false,
    });
  });

  it("uses the pro limit for pro", () => {
    const u = currentUsage({ messagesUsed: 150, periodStart: NOV }, "pro", NOW);
    expect(u.limit).toBe(PLAN_LIMITS.pro.messagesPerMonth);
    expect(u.limit).toBe(2000);
    expect(u.atLimit).toBe(false);
  });

  it("shows 0 used when period_start is in a past month (lazy reset)", () => {
    expect(
      currentUsage({ messagesUsed: 100, periodStart: OCT }, "free", NOW),
    ).toMatchObject({
      used: 0,
      atLimit: false,
      resetsAt: "2026-12-01T00:00:00.000Z",
    });
  });

  it("is at the limit at exactly the limit and above it", () => {
    const at = currentUsage(
      { messagesUsed: 100, periodStart: NOV },
      "free",
      NOW,
    );
    expect(at).toMatchObject({ used: 100, limit: 100, atLimit: true });
    // Same count on pro is well under its limit.
    expect(
      currentUsage({ messagesUsed: 100, periodStart: NOV }, "pro", NOW).atLimit,
    ).toBe(false);
    // A downgrade can leave a count above the new limit.
    expect(
      currentUsage({ messagesUsed: 150, periodStart: NOV }, "free", NOW),
    ).toMatchObject({
      used: 150,
      atLimit: true,
    });
  });

  it("uses UTC months: just before and at a month boundary", () => {
    const lastSecond = new Date("2026-11-30T23:59:59Z");
    expect(
      currentUsage({ messagesUsed: 5, periodStart: NOV }, "free", lastSecond),
    ).toMatchObject({
      used: 5,
      resetsAt: "2026-12-01T00:00:00.000Z",
    });
    const newMonth = new Date("2026-12-01T00:00:00Z");
    expect(
      currentUsage({ messagesUsed: 5, periodStart: NOV }, "free", newMonth),
    ).toMatchObject({
      used: 0,
      resetsAt: "2027-01-01T00:00:00.000Z",
    });
  });

  it("rolls the reset date over the year end", () => {
    const dec = new Date("2026-12-15T10:00:00Z");
    expect(
      currentUsage(
        { messagesUsed: 1, periodStart: "2026-12-01T00:00:00Z" },
        "pro",
        dec,
      ).resetsAt,
    ).toBe("2027-01-01T00:00:00.000Z");
  });

  it("treats an unreadable period_start as a past period", () => {
    expect(
      currentUsage({ messagesUsed: 9, periodStart: "nope" }, "free", NOW).used,
    ).toBe(0);
  });
});
