import { addDays, toWIBDate } from "../utils/date.js";

export type GoalProgressHabit = {
  id: string;
  createdAt: Date;
  checkIns: Array<{ date: Date; status: "DONE" | "MISS" }>;
};

export type GoalProgress = {
  goalId: string;
  habitCount: number;
  weeklyCompletionPct: number;
  perHabit: Array<{ habitId: string; done: number; miss: number }>;
};

/**
 * Counts each linked habit only from its creation date (inclusive, in WIB).
 * Days before a habit existed are excluded from both misses and the completion denominator.
 */
export function calculateGoalProgress(
  goalId: string,
  habits: GoalProgressHabit[],
  weekStart: string,
  today: string,
): GoalProgress {
  const weekEnd = addDays(weekStart, 6);
  const endDate = today < weekEnd ? today : weekEnd;
  let activeDaysTotal = 0;
  let doneTotal = 0;

  const perHabit = habits.map((habit) => {
    const createdDate = toWIBDate(habit.createdAt);
    const startDate = createdDate > weekStart ? createdDate : weekStart;
    const checkInsByDate = new Map(
      habit.checkIns.map((checkIn) => [checkIn.date.toISOString().slice(0, 10), checkIn.status]),
    );
    let done = 0;
    let miss = 0;

    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
      activeDaysTotal += 1;
      const status = checkInsByDate.get(date);
      if (status === "DONE") done += 1;
      else if (status === "MISS" || date < today) miss += 1;
    }

    doneTotal += done;
    return { habitId: habit.id, done, miss };
  });

  return {
    goalId,
    habitCount: habits.length,
    weeklyCompletionPct: Math.round((100 * doneTotal) / Math.max(1, activeDaysTotal)),
    perHabit,
  };
}
