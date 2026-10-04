import type { Request, Response } from "express";
import { handleApiError, sendApiError } from "../lib/api-error.js";
import { prisma } from "../lib/prisma.js";
import { validatedBody, validatedParams, validatedQuery } from "../middleware/validate-request.js";
import type {
  CreateHabitInput,
  DeleteHabitInput,
  ListHabitsQuery,
  UpdateHabitInput,
} from "../schemas/habits.js";
import type { IdParams } from "../schemas/params.js";
import { dateOnlyToUTC, todayWIB } from "../utils/date.js";
import { calcDailyStreak } from "../services/streak.js";
import { deleteHabitAndReplaceGoals, HabitDisappearedError } from "../services/habits.js";

function shiftDate(date: string, days: number): string {
  const value = dateOnlyToUTC(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function notFound(res: Response): void {
  sendApiError(res, 404, "NOT_FOUND", "Habit tidak ditemukan.");
}

export async function listHabits(req: Request, res: Response): Promise<void> {
  const { date: requestedDate } = validatedQuery<ListHabitsQuery>(res);
  const today = todayWIB();
  const selectedDate = requestedDate ?? today;
  const rangeStart = shiftDate(today, -89);
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) {
      sendApiError(res, 401, "UNAUTHORIZED", "Autentikasi diperlukan.");
      return;
    }
    const habits = await prisma.habit.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
      include: {
        checkIns: {
          where: {
            OR: [
              { date: { gte: dateOnlyToUTC(rangeStart), lte: dateOnlyToUTC(today) } },
              { date: dateOnlyToUTC(selectedDate) },
            ],
          },
          select: { date: true, status: true },
        },
      },
    });
    res.status(200).json({
      habits: habits.map(({ checkIns, ...habit }) => {
        const selectedCheckIn = checkIns.find((checkIn) => dateKey(checkIn.date) === selectedDate);
        const recentDoneDates = checkIns
          .filter(
            (checkIn) =>
              checkIn.status === "DONE" &&
              dateKey(checkIn.date) >= rangeStart &&
              dateKey(checkIn.date) <= today,
          )
          .map((checkIn) => checkIn.date);
        return {
          ...habit,
          checkIn: selectedCheckIn === undefined ? null : { status: selectedCheckIn.status },
          checkedIn: selectedCheckIn?.status === "DONE",
          streak: calcDailyStreak(recentDoneDates, dateOnlyToUTC(today)),
        };
      }),
    });
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

export async function getHabit(req: Request, res: Response): Promise<void> {
  const { id } = validatedParams<IdParams>(res);
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) return notFound(res);
    const today = todayWIB();
    const rangeStart = shiftDate(today, -89);
    const habit = await prisma.habit.findFirst({
      where: { id, ownerId },
      include: {
        checkIns: {
          where: {
            date: { gte: dateOnlyToUTC(rangeStart), lte: dateOnlyToUTC(today) },
            status: "DONE",
          },
          select: { date: true },
          orderBy: { date: "asc" },
        },
      },
    });
    if (habit === null) return notFound(res);
    const { checkIns, ...habitData } = habit;
    res.status(200).json({
      habit: {
        ...habitData,
        streak: calcDailyStreak(
          checkIns.map(({ date }) => date),
          dateOnlyToUTC(today),
        ),
      },
    });
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

export async function createHabit(req: Request, res: Response): Promise<void> {
  const input = validatedBody<CreateHabitInput>(res);
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) {
      sendApiError(res, 401, "UNAUTHORIZED", "Autentikasi diperlukan.");
      return;
    }
    const habit = await prisma.habit.create({
      data: {
        ownerId,
        title: input.title,
        type: input.type,
        description: input.description ?? null,
      },
    });
    res.status(201).json({ habit });
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

export async function updateHabit(req: Request, res: Response): Promise<void> {
  const input = validatedBody<UpdateHabitInput>(res);
  const { id } = validatedParams<IdParams>(res);
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) return notFound(res);
    const data: { title?: string; description?: string | null } = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    const result = await prisma.habit.updateMany({ where: { id, ownerId }, data });
    if (result.count === 0) return notFound(res);
    const habit = await prisma.habit.findFirst({ where: { id, ownerId } });
    if (habit === null) return notFound(res);
    res.status(200).json({ habit });
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

export async function deleteHabit(req: Request, res: Response): Promise<void> {
  const input = validatedBody<DeleteHabitInput>(res);
  const { id } = validatedParams<IdParams>(res);
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) return notFound(res);
    const result = await deleteHabitAndReplaceGoals(ownerId, id, input);

    if (result === "missing") return notFound(res);
    if (result === "replacements-required") {
      sendApiError(
        res,
        422,
        "REPLACEMENT_REQUIRED",
        "Pilih satu habit pengganti untuk setiap goal yang hanya memiliki habit ini.",
      );
      return;
    }
    if (result === "invalid-replacement") {
      sendApiError(res, 404, "NOT_FOUND", "Habit replacement tidak ditemukan.");
      return;
    }
    res.status(204).end();
  } catch (error: unknown) {
    if (error instanceof HabitDisappearedError) return notFound(res);
    handleApiError(req, res, error);
  }
}
