import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { handleApiError, sendApiError } from "../lib/api-error.js";
import { prisma } from "../lib/prisma.js";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate-request.js";
import type { CheckInInput } from "../schemas/check-ins.js";
import type { IdParams } from "../schemas/params.js";
import { dateOnlyToUTC, todayWIB } from "../utils/date.js";
import { calcDailyStreak } from "../services/streak.js";

function notFound(res: Response): void {
  sendApiError(res, 404, "NOT_FOUND", "Habit tidak ditemukan.");
}

function validateCheckInDate(date: string, today: string, res: Response): boolean {
  if (date > today) {
    sendApiError(res, 422, "FUTURE_DATE", "Tanggal check-in tidak boleh di masa depan.");
    return false;
  }
  if (date < today) {
    sendApiError(
      res,
      422,
      "BACKFILL_NOT_ALLOWED",
      "Check-in untuk tanggal lampau tidak diizinkan.",
    );
    return false;
  }
  return true;
}

export async function createCheckIn(req: Request, res: Response): Promise<void> {
  const input = validatedBody<CheckInInput>(res);
  const { id: habitId } = validatedParams<IdParams>(res);
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) return notFound(res);
    if (
      (await prisma.habit.findFirst({ where: { id: habitId, ownerId }, select: { id: true } })) ===
      null
    )
      return notFound(res);

    const today = todayWIB();
    if (!validateCheckInDate(input.date, today, res)) return;

    const date = dateOnlyToUTC(input.date);
    try {
      await prisma.checkIn.upsert({
        where: { habitId_date: { habitId, date } },
        create: { habitId, date, status: "DONE" },
        update: { status: "DONE" },
        select: { habitId: true, date: true },
      });
      const checkIns = await prisma.checkIn.findMany({
        where: {
          habitId,
          date: { gte: dateOnlyToUTC(addDays(today, -89)), lte: dateOnlyToUTC(today) },
          status: "DONE",
        },
        select: { date: true },
        orderBy: { date: "asc" },
      });
      const streak = calcDailyStreak(
        checkIns.map(({ date: checkInDate }) => checkInDate),
        dateOnlyToUTC(today),
      );
      res.status(200).json({
        habitId,
        date: input.date,
        streak: { current: streak.current, longest: streak.longest },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const checkIn = await prisma.checkIn.findUnique({
          where: { habitId_date: { habitId, date } },
          select: { habitId: true, date: true },
        });
        if (checkIn !== null) {
          const checkIns = await prisma.checkIn.findMany({
            where: {
              habitId,
              date: { gte: dateOnlyToUTC(addDays(today, -89)), lte: dateOnlyToUTC(today) },
              status: "DONE",
            },
            select: { date: true },
            orderBy: { date: "asc" },
          });
          const streak = calcDailyStreak(
            checkIns.map(({ date: checkInDate }) => checkInDate),
            dateOnlyToUTC(today),
          );
          res.status(200).json({
            habitId,
            date: input.date,
            streak: { current: streak.current, longest: streak.longest },
          });
          return;
        }
      }
      throw error;
    }
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

export async function deleteCheckIn(req: Request, res: Response): Promise<void> {
  const input = validatedQuery<CheckInInput>(res);
  const { id: habitId } = validatedParams<IdParams>(res);
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) return notFound(res);
    if (
      (await prisma.habit.findFirst({ where: { id: habitId, ownerId }, select: { id: true } })) ===
      null
    )
      return notFound(res);

    const today = todayWIB();
    if (!validateCheckInDate(input.date, today, res)) return;

    await prisma.checkIn.deleteMany({
      where: { habitId, date: dateOnlyToUTC(input.date), status: "DONE" },
    });
    res.status(204).end();
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

function addDays(date: string, days: number): string {
  const value = dateOnlyToUTC(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
