import { describe, expect, it } from "vitest";
import { dateOnlyToUTC } from "../../utils/date.js";
import { createGoalSchema } from "../../schemas/goals.js";
import { calculateGoalProgress, type GoalProgressHabit } from "../goal-progress.js";

function habit(
  id: string,
  createdAt: string,
  doneDates: string[] = [],
  missDates: string[] = [],
): GoalProgressHabit {
  return {
    id,
    createdAt: new Date(createdAt),
    checkIns: [
      ...doneDates.map((date) => ({ date: dateOnlyToUTC(date), status: "DONE" as const })),
      ...missDates.map((date) => ({ date: dateOnlyToUTC(date), status: "MISS" as const })),
    ],
  };
}

describe("goal weekly progress", () => {
  it("GOAL-U-01 aggregates done and habit count for multiple habits", () => {
    const result = calculateGoalProgress(
      "goal",
      [
        habit("first", "2026-09-28T00:00:00.000Z", ["2026-09-28", "2026-09-29"]),
        habit("second", "2026-09-28T00:00:00.000Z", ["2026-09-29"]),
      ],
      "2026-09-28",
      "2026-09-29",
    );

    expect(result.habitCount).toBe(2);
    expect(result.perHabit).toEqual([
      { habitId: "first", done: 2, miss: 0 },
      { habitId: "second", done: 1, miss: 1 },
    ]);
    expect(result.weeklyCompletionPct).toBe(75);
  });

  it("GOAL-U-02 uses the same DONE semantics regardless of habit kind", () => {
    const result = calculateGoalProgress(
      "mixed",
      [
        habit("build", "2026-09-28T00:00:00.000Z", ["2026-09-28"]),
        habit("break", "2026-09-28T00:00:00.000Z", ["2026-09-28"]),
      ],
      "2026-09-28",
      "2026-09-28",
    );
    expect(result.perHabit.map(({ done }) => done)).toEqual([1, 1]);
    expect(result.weeklyCompletionPct).toBe(100);
  });

  it("counts creation date inclusively in WIB and ignores earlier days", () => {
    const result = calculateGoalProgress(
      "new-habit",
      [habit("habit", "2026-09-30T18:00:00.000Z", ["2026-10-01"])],
      "2026-09-28",
      "2026-10-01",
    );
    expect(result.perHabit).toEqual([{ habitId: "habit", done: 1, miss: 0 }]);
    expect(result.weeklyCompletionPct).toBe(100);
  });

  it("counts only active dates since creation and keeps an unchecked today out of misses", () => {
    const result = calculateGoalProgress(
      "created-midweek",
      [habit("habit", "2026-09-30T12:00:00.000Z", ["2026-09-30"])],
      "2026-09-28",
      "2026-10-01",
    );
    expect(result.perHabit).toEqual([{ habitId: "habit", done: 1, miss: 0 }]);
    expect(result.weeklyCompletionPct).toBe(50);
  });

  it("counts a past active date without DONE as miss but ignores dates before creation", () => {
    const result = calculateGoalProgress(
      "created-midweek",
      [habit("habit", "2026-09-30T12:00:00.000Z", ["2026-09-30"])],
      "2026-09-28",
      "2026-10-02",
    );
    expect(result.perHabit).toEqual([{ habitId: "habit", done: 1, miss: 1 }]);
    expect(result.weeklyCompletionPct).toBe(33);
  });

  it("GOAL-U-03/04 safely reports empty progress without division by zero", () => {
    expect(calculateGoalProgress("empty", [], "2026-09-28", "2026-09-29")).toEqual({
      goalId: "empty",
      habitCount: 0,
      weeklyCompletionPct: 0,
      perHabit: [],
    });
  });

  it("GOAL-U-03 rejects a goal without an existing or inline habit at schema validation", () => {
    expect(createGoalSchema.safeParse({ title: "No habit" }).success).toBe(false);
  });

  it("does not count days after today, even when the habit existed earlier", () => {
    const result = calculateGoalProgress(
      "current-week",
      [habit("habit", "2026-09-28T00:00:00.000Z", ["2026-09-28", "2026-10-01"])],
      "2026-09-28",
      "2026-09-30",
    );
    expect(result.perHabit).toEqual([{ habitId: "habit", done: 1, miss: 1 }]);
    expect(result.weeklyCompletionPct).toBe(33);
  });
});
