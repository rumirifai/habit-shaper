import { afterEach, describe, expect, it, vi } from "vitest";
import { checkInSchema } from "../../schemas/check-ins.js";
import { addDays, dateOnlyToUTC, mondayOfWeekWIB, todayWIB, toWIBDate } from "../date.js";

afterEach(() => vi.useRealTimers());

describe("WIB date utilities", () => {
  it("DATE-U-01 returns YYYY-MM-DD based on Asia/Jakarta, including UTC midnight boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T18:00:00.000Z"));
    expect(todayWIB()).toBe("2026-10-04");
    expect(todayWIB()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("converts timestamps to their WIB calendar date", () => {
    expect(toWIBDate(new Date("2026-09-30T18:00:00.000Z"))).toBe("2026-10-01");
  });

  it.each([
    ["2026-09-28", "2026-09-28"],
    ["2026-10-04", "2026-09-28"],
    ["2026-09-30", "2026-09-28"],
    ["2026-10-04", "2026-09-28"],
    ["2026-01-04", "2025-12-29"],
  ])("DATE-U-02..05 mondayOfWeekWIB(%s) -> %s", (date, expected) => {
    expect(mondayOfWeekWIB(date)).toBe(expected);
  });

  it("DATE-U-06 adds dates correctly across month/year and leap day boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("DATE-U-07 rejects impossible ISO dates in request schemas", () => {
    expect(checkInSchema.safeParse({ date: "2026-02-30" }).success).toBe(false);
    expect(checkInSchema.safeParse({ date: "not-a-date" }).success).toBe(false);
    expect(checkInSchema.safeParse({ date: "2024-02-29" }).success).toBe(true);
  });

  it("converts valid date-only values to UTC midnight", () => {
    expect(dateOnlyToUTC("2026-10-04").toISOString()).toBe("2026-10-04T00:00:00.000Z");
  });
});
