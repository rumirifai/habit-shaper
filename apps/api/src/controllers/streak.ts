import type { Request, Response } from "express";
import { handleApiError, sendApiError } from "../lib/api-error.js";
import { prisma } from "../lib/prisma.js";
import { validatedParams, validatedQuery } from "../middleware/validate-request.js";
import type { GetStreakQuery } from "../schemas/streak.js";
import type { IdParams } from "../schemas/params.js";
import { calcCurrentStreak, calcLongestStreak, calcWeekly } from "../services/streak.js";
import { dateOnlyToUTC, mondayOfWeekWIB, todayWIB } from "../utils/date.js";

export async function getStreak(req: Request, res: Response): Promise<void> {
  const query = validatedQuery<GetStreakQuery>(res);
  const { id: habitId } = validatedParams<IdParams>(res);
  const ownerId = req.user?.id;
  if (ownerId === undefined) {
    sendApiError(res, 404, "NOT_FOUND", "Habit tidak ditemukan.");
    return;
  }

  try {
    const habit = await prisma.habit.findFirst({
      where: { id: habitId, ownerId },
      select: { id: true },
    });
    if (habit === null) {
      sendApiError(res, 404, "NOT_FOUND", "Habit tidak ditemukan.");
      return;
    }
    if (query.range === "daily") {
      const today = todayWIB();
      const startDateKey = addDays(today, -89);
      const endDate = dateOnlyToUTC(today);
      const recentCheckIns = await prisma.checkIn.findMany({
        where: {
          habitId,
          date: { gte: dateOnlyToUTC(startDateKey), lte: endDate },
          status: "DONE",
        },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      const checkInDates = recentCheckIns.map(({ date }) => date);
      res.status(200).json({
        habitId: habit.id,
        current: calcCurrentStreak(checkInDates, dateOnlyToUTC(today)),
        longest: calcLongestStreak(checkInDates),
        lastDoneDate: checkInDates.at(-1)?.toISOString().slice(0, 10) ?? null,
      });
      return;
    }
    const requestedWeek = query.week ?? todayWIB();
    const monday = mondayOfWeekWIB(requestedWeek);
    const sunday = addDays(monday, 6);
    const weekCheckIns = await prisma.checkIn.findMany({
      where: {
        habitId,
        date: { gte: dateOnlyToUTC(monday), lte: dateOnlyToUTC(sunday) },
        status: "DONE",
      },
      select: { date: true },
    });
    res.status(200).json({
      habitId: habit.id,
      ...calcWeekly(
        weekCheckIns.map(({ date }) => date),
        dateOnlyToUTC(monday),
      ),
    });
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

function addDays(date: string, days: number): string {
  const value = dateOnlyToUTC(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
