import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays, dateOnlyToUTC, mondayOfWeekWIB } from "../../utils/date.js";
import { calcCurrentStreak, calcDailyStreak, calcLongestStreak, calcWeekly } from "../streak.js";

afterEach(() => vi.useRealTimers());

const dates = (...values: string[]): Date[] => values.map(dateOnlyToUTC);

describe("daily streak calculations", () => {
  it("DAILY-U-01 counts consecutive DONE dates through today", () => {
    const today = "2026-10-04";
    expect(
      calcCurrentStreak(
        dates(...Array.from({ length: 5 }, (_, index) => addDays(today, index - 4))),
        dateOnlyToUTC(today),
      ),
    ).toBe(5);
  });

  it("DAILY-U-02 a missing date breaks a run", () => {
    expect(
      calcCurrentStreak(
        dates("2026-10-01", "2026-10-02", "2026-10-04"),
        dateOnlyToUTC("2026-10-04"),
      ),
    ).toBe(1);
  });

  it("DAILY-U-03 pending today does not break the run ending yesterday", () => {
    expect(
      calcCurrentStreak(
        dates("2026-10-01", "2026-10-02", "2026-10-03"),
        dateOnlyToUTC("2026-10-04"),
      ),
    ).toBe(3);
  });

  it("DAILY-U-04/05 explicit MISS and empty dates have the same break effect for both habit types", () => {
    const datesWithMissRow = dates("2026-10-01", "2026-10-03");
    const datesWithEmptyMiss = dates("2026-10-01", "2026-10-03");
    expect(calcCurrentStreak(datesWithMissRow, dateOnlyToUTC("2026-10-03"))).toBe(1);
    expect(calcCurrentStreak(datesWithEmptyMiss, dateOnlyToUTC("2026-10-03"))).toBe(1);
  });

  it("DAILY-U-06 undoing today's DONE recalculates the run from yesterday", () => {
    const beforeUndo = dates("2026-10-02", "2026-10-03", "2026-10-04");
    const afterUndo = dates("2026-10-02", "2026-10-03");
    expect(calcCurrentStreak(beforeUndo, dateOnlyToUTC("2026-10-04"))).toBe(3);
    expect(calcCurrentStreak(afterUndo, dateOnlyToUTC("2026-10-04"))).toBe(2);
  });

  it("DAILY-U-07 has no weekly allowance in the daily calculation", () => {
    expect(calcCurrentStreak(dates("2026-10-01", "2026-10-03"), dateOnlyToUTC("2026-10-03"))).toBe(
      1,
    );
    expect(calcCurrentStreak(dates("2026-10-01"), dateOnlyToUTC("2026-10-03"))).toBe(0);
  });
});

describe("longest streak calculations", () => {
  it("LONG-U-01 returns the longest continuous run", () => {
    expect(
      calcLongestStreak(
        dates(
          "2026-09-20",
          "2026-09-21",
          "2026-09-22",
          "2026-09-25",
          "2026-09-26",
          "2026-09-27",
          "2026-09-28",
          "2026-09-29",
        ),
        dateOnlyToUTC("2026-09-29"),
      ),
    ).toBe(5);
  });

  it("LONG-U-02 counts all consecutive DONE dates", () => {
    expect(
      calcLongestStreak(
        dates("2026-10-01", "2026-10-02", "2026-10-03"),
        dateOnlyToUTC("2026-10-03"),
      ),
    ).toBe(3);
  });

  it("LONG-U-03 ignores future dates", () => {
    expect(
      calcLongestStreak(
        dates("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"),
        dateOnlyToUTC("2026-10-03"),
      ),
    ).toBe(3);
    expect(
      calcDailyStreak(dates("2026-10-01", "2026-10-04"), dateOnlyToUTC("2026-10-03")).lastDoneDate,
    ).toBe("2026-10-01");
  });

  it("LONG-U-04 empty history returns zero and null last date", () => {
    expect(calcDailyStreak([], dateOnlyToUTC("2026-10-04"))).toEqual({
      current: 0,
      longest: 0,
      lastDoneDate: null,
    });
  });
});

describe("weekly streak calculations", () => {
  it("WEEK-U-01 seven completed dates produce done 7 and allowance 3", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T04:00:00.000Z"));
    const result = calcWeekly(
      Array.from({ length: 7 }, (_, index) => dateOnlyToUTC(addDays("2026-09-28", index))),
      dateOnlyToUTC("2026-09-28"),
    );
    expect(result).toMatchObject({
      done: 7,
      miss: 0,
      allowance: 3,
      remaining: 3,
      weekStart: "2026-09-28",
      weekEnd: "2026-10-04",
    });
  });

  it("WEEK-U-02 three misses exhaust the allowance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T04:00:00.000Z"));
    const result = calcWeekly(
      dates("2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"),
      dateOnlyToUTC("2026-09-28"),
    );
    expect(result).toMatchObject({ done: 4, miss: 3, remaining: 0 });
  });

  it("WEEK-U-03 clamps remaining tolerance at zero", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-11T04:00:00.000Z"));
    const result = calcWeekly(dates("2026-09-28"), dateOnlyToUTC("2026-09-28"));
    expect(result.miss).toBe(6);
    expect(result.remaining).toBe(0);
  });

  it("WEEK-U-04/05 distinguishes past empty, today pending, and future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T04:00:00.000Z"));
    const result = calcWeekly(dates("2026-09-30"), dateOnlyToUTC("2026-09-28"));
    expect(result.days.map(({ status }) => status)).toEqual([
      "MISS",
      "MISS",
      "DONE",
      "PENDING",
      "FUTURE",
      "FUTURE",
      "FUTURE",
    ]);
    expect(result).toMatchObject({ done: 1, miss: 2 });
  });

  it("WEEK-U-06 normalizes a requested date to Monday and spans seven dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T04:00:00.000Z"));
    const result = calcWeekly([], dateOnlyToUTC("2026-10-01"));
    expect(result.weekStart).toBe(mondayOfWeekWIB("2026-10-01"));
    expect(result.weekEnd).toBe("2026-10-04");
    expect(result.days).toHaveLength(7);
  });

  it("WEEK-U-07 treats absent dates as implicit misses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T04:00:00.000Z"));
    const result = calcWeekly(dates("2026-09-28"), dateOnlyToUTC("2026-09-28"));
    expect(result.miss).toBe(4);
  });

  it("WEEK-U-08 does not count future dates in done or miss totals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T04:00:00.000Z"));
    const result = calcWeekly(
      dates("2026-09-28", "2026-09-29", "2026-09-30"),
      dateOnlyToUTC("2026-09-28"),
    );
    expect(result.done).toBe(3);
    expect(result.miss).toBe(0);
  });
});
