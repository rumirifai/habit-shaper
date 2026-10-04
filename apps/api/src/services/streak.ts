import { addDays, dateOnlyToUTC, mondayOfWeekWIB, todayWIB } from "../utils/date.js";

const ALLOWANCE = 3 as const;

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type WeeklyResult = {
  weekStart: string;
  weekEnd: string;
  done: number;
  miss: number;
  allowance: 3;
  remaining: number;
  days: Array<{ date: string; status: "DONE" | "MISS" | "PENDING" | "FUTURE" }>;
};

export type DailyResult = {
  current: number;
  longest: number;
  lastDoneDate: string | null;
};

export function calcCurrentStreak(checkIns: Date[], today: Date): number {
  const doneDates = new Set(checkIns.map(dateKey));
  const todayKey = dateKey(today);
  let cursor = doneDates.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let streak = 0;
  while (doneDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function calcLongestStreak(
  checkIns: Date[],
  today: Date = dateOnlyToUTC(todayWIB()),
): number {
  const todayKey = dateKey(today);
  const dates = [...new Set(checkIns.map(dateKey))].filter((date) => date <= todayKey).sort();
  let longest = 0;
  let current = 0;
  let previous: string | undefined;
  for (const date of dates) {
    current = previous !== undefined && addDays(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

export function calcDailyStreak(checkIns: Date[], today: Date): DailyResult {
  const dates = [...new Set(checkIns.map(dateKey))].sort();
  return {
    current: calcCurrentStreak(checkIns, today),
    longest: calcLongestStreak(checkIns, today),
    lastDoneDate: dates.filter((date) => date <= dateKey(today)).at(-1) ?? null,
  };
}

export function calcWeekly(checkIns: Date[], weekStart: Date): WeeklyResult {
  const monday = mondayOfWeekWIB(dateKey(weekStart));
  const today = todayWIB();
  const doneDates = new Set(checkIns.map(dateKey));
  const days: WeeklyResult["days"] = [];
  let done = 0;
  let miss = 0;
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(monday, index);
    if (date > today) {
      days.push({ date, status: "FUTURE" });
    } else if (doneDates.has(date)) {
      done += 1;
      days.push({ date, status: "DONE" });
    } else if (date === today) {
      days.push({ date, status: "PENDING" });
    } else {
      miss += 1;
      days.push({ date, status: "MISS" });
    }
  }
  return {
    weekStart: monday,
    weekEnd: addDays(monday, 6),
    done,
    miss,
    allowance: ALLOWANCE,
    remaining: Math.max(0, ALLOWANCE - miss),
    days,
  };
}
