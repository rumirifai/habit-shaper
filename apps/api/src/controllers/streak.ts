import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getStreakQuerySchema } from "../schemas/streak.js";
import { calcCurrentStreak, calcWeekly } from "../services/streak.js";
import { dateOnlyToUTC, mondayOfWeekWIB, todayWIB } from "../utils/date.js";

export async function getStreak(req: Request, res: Response): Promise<void> {
  const parsed = getStreakQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Query streak tidak valid.", details: parsed.error.flatten() },
    });
    return;
  }
  const habitId = req.params.id;
  const ownerId = req.user?.id;
  if (typeof habitId !== "string" || ownerId === undefined) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Habit tidak ditemukan." } });
    return;
  }

  try {
    const habit = await prisma.habit.findFirst({ where: { id: habitId, ownerId }, select: { id: true } });
    if (habit === null) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Habit tidak ditemukan." } });
      return;
    }
    if (parsed.data.range === "daily") {
      const today = todayWIB();
      let startDateKey = addDays(today, -89);
      const endDate = dateOnlyToUTC(today);
      let recentCheckIns = await prisma.checkIn.findMany({
        where: { habitId, date: { gte: dateOnlyToUTC(startDateKey), lte: endDate }, status: "DONE" },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      const streakAnchor = recentCheckIns.some(({ date }) => date.toISOString().slice(0, 10) === today)
        ? today
        : addDays(today, -1);
      const streakWindowDays = Math.floor(
        (dateOnlyToUTC(streakAnchor).getTime() - dateOnlyToUTC(startDateKey).getTime()) / 86_400_000,
      ) + 1;
      while (
        calcCurrentStreak(recentCheckIns.map(({ date }) => date), dateOnlyToUTC(today)) >= streakWindowDays
      ) {
        const previousDay = addDays(startDateKey, -1);
        const boundaryCheckIn = await prisma.checkIn.findFirst({
          where: { habitId, date: dateOnlyToUTC(previousDay), status: "DONE" },
          select: { date: true },
        });
        if (boundaryCheckIn === null) break;
        const previousStartKey = addDays(startDateKey, -90);
        const earlierCheckIns = await prisma.checkIn.findMany({
          where: {
            habitId,
            date: { gte: dateOnlyToUTC(previousStartKey), lt: dateOnlyToUTC(startDateKey) },
            status: "DONE",
          },
          select: { date: true },
          orderBy: { date: "asc" },
        });
        if (earlierCheckIns.length === 0) break;
        recentCheckIns = [...earlierCheckIns, ...recentCheckIns];
        startDateKey = previousStartKey;
      }
      const [longestResult, lastDone] = await Promise.all([
        prisma.$queryRaw<Array<{ longest: bigint }>>(Prisma.sql`
          WITH done_dates AS (
            SELECT "date"::date AS day,
                   row_number() OVER (ORDER BY "date")::int AS sequence
            FROM "CheckIn"
            WHERE "habitId" = ${habitId} AND "status" = 'DONE'::"CheckInStatus"
          ), streak_groups AS (
            SELECT day - sequence AS streak_group
            FROM done_dates
          )
          SELECT COALESCE(MAX(streak_length), 0)::bigint AS longest
          FROM (
            SELECT COUNT(*) AS streak_length
            FROM streak_groups
            GROUP BY streak_group
          ) AS streak_lengths
        `),
        prisma.checkIn.findFirst({
          where: { habitId, status: "DONE" },
          select: { date: true },
          orderBy: { date: "desc" },
        }),
      ]);
      res.status(200).json({
        habitId: habit.id,
        current: calcCurrentStreak(recentCheckIns.map(({ date }) => date), dateOnlyToUTC(today)),
        longest: Number(longestResult[0]?.longest ?? 0n),
        lastDoneDate: lastDone?.date.toISOString().slice(0, 10) ?? null,
      });
      return;
    }
    const requestedWeek = parsed.data.week ?? todayWIB();
    const monday = mondayOfWeekWIB(requestedWeek);
    const sunday = addDays(monday, 6);
    const weekCheckIns = await prisma.checkIn.findMany({
      where: { habitId, date: { gte: dateOnlyToUTC(monday), lte: dateOnlyToUTC(sunday) }, status: "DONE" },
      select: { date: true },
    });
    res.status(200).json({
      habitId: habit.id,
      ...calcWeekly(weekCheckIns.map(({ date }) => date), dateOnlyToUTC(monday)),
    });
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
  }
}

function addDays(date: string, days: number): string {
  const value = dateOnlyToUTC(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
