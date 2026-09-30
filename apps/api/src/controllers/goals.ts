import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { assignHabitSchema, createGoalSchema, updateGoalSchema } from "../schemas/goals.js";

function error(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res
    .status(status)
    .json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}
function notFound(res: Response): void {
  error(res, 404, "NOT_FOUND", "Goal atau habit tidak ditemukan.");
}
function param(req: Request, key: string): string | null {
  const value = req.params[key];
  return typeof value === "string" ? value : null;
}
function mondayUtc(date: Date): Date {
  const day = date.getUTCDay();
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (day === 0 ? 6 : day - 1));
  return monday;
}
function todayWibUtc(): Date {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${date}T00:00:00.000Z`);
}
function goalProgress(
  goalId: string,
  habitLinks: Array<{
    habit: { id: string; checkIns: Array<{ date: Date; status: "DONE" | "MISS" }> };
  }>,
  elapsedDays: number,
  monday: Date,
  today: Date,
) {
  const habitCount = habitLinks.length;
  const perHabit = habitLinks.map(({ habit }) => {
    const byDate = new Map(habit.checkIns.map((checkIn) => [checkIn.date.toISOString().slice(0, 10), checkIn.status]));
    let done = 0;
    let miss = 0;
    for (let day = 0; day < elapsedDays; day += 1) {
      const date = new Date(monday);
      date.setUTCDate(date.getUTCDate() + day);
      const key = date.toISOString().slice(0, 10);
      const status = byDate.get(key);
      if (status === "DONE") done += 1;
      else if (status === "MISS" || date < today) miss += 1;
    }
    return { habitId: habit.id, done, miss };
  });
  const done = perHabit.reduce((sum, habit) => sum + habit.done, 0);
  return {
    goalId,
    habitCount,
    weeklyCompletionPct: Math.round((100 * done) / Math.max(1, habitCount * elapsedDays)),
    perHabit,
  };
}
const goalInclude = {
  habitLinks: {
    include: { habit: { select: { id: true, title: true, type: true, description: true } } },
  },
} as const;

export async function createGoal(req: Request, res: Response): Promise<void> {
  const parsed = createGoalSchema.safeParse(req.body);
  if (!parsed.success)
    return error(res, 400, "VALIDATION_ERROR", "Input goal tidak valid.", parsed.error.flatten());
  const ownerId = req.user?.id;
  if (!ownerId) return;
  try {
    const goal = await prisma.$transaction(async (tx) => {
      const found = await tx.habit.findMany({
        where: { id: { in: parsed.data.habitIds }, ownerId },
        select: { id: true },
      });
      if (found.length !== new Set(parsed.data.habitIds).size) return null;
      const created = await tx.goal.create({
        data: {
          ownerId,
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          deadline: parsed.data.deadline ? new Date(`${parsed.data.deadline}T00:00:00.000Z`) : null,
        },
      });
      const inline = await Promise.all(
        parsed.data.newHabits.map((habit) =>
          tx.habit.create({
            data: {
              ownerId,
              title: habit.title,
              type: habit.type,
              description: habit.description ?? null,
            },
            select: { id: true },
          }),
        ),
      );
      await tx.goalHabit.createMany({
        data: [...found.map(({ id }) => id), ...inline.map(({ id }) => id)].map((habitId) => ({
          goalId: created.id,
          habitId,
        })),
      });
      return tx.goal.findUnique({ where: { id: created.id }, include: goalInclude });
    });
    if (goal === null) return notFound(res);
    res.status(201).json({ goal });
  } catch {
    error(res, 500, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal.");
  }
}

export async function listGoals(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  if (!ownerId) return;
  try {
    const today = todayWibUtc();
    const monday = mondayUtc(today);
    const elapsedDays = Math.floor((today.getTime() - monday.getTime()) / 86400000) + 1;
    const goals = await prisma.goal.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
      include: {
        habitLinks: {
          include: {
            habit: {
              select: {
                id: true,
                title: true,
                type: true,
                checkIns: {
                  where: { date: { gte: monday, lte: today } },
                  select: { date: true, status: true },
                },
              },
            },
          },
        },
      },
    });
    res.status(200).json({
      goals: goals.map((goal) => {
        const habitCount = goal.habitLinks.length;
        const progress = goalProgress(goal.id, goal.habitLinks, elapsedDays, monday, today);
        return {
          ...goal,
          habitLinks: goal.habitLinks.map((link) => {
            const { checkIns: _checkIns, ...habit } = link.habit;
            return { ...link, habit };
          }),
          habitCount,
          progress,
        };
      }),
    });
  } catch {
    error(res, 500, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal.");
  }
}

export async function getGoal(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  const id = param(req, "id");
  if (!ownerId || !id) return notFound(res);
  try {
    const today = todayWibUtc();
    const monday = mondayUtc(today);
    const elapsedDays = Math.floor((today.getTime() - monday.getTime()) / 86400000) + 1;
    const goal = await prisma.goal.findFirst({
      where: { id, ownerId },
      include: {
        habitLinks: {
          include: {
            habit: {
              select: {
                id: true,
                title: true,
                type: true,
                description: true,
                checkIns: {
                  where: { date: { gte: monday, lte: today } },
                  select: { date: true, status: true },
                },
              },
            },
          },
        },
      },
    });
    if (!goal) return notFound(res);
    const progress = goalProgress(goal.id, goal.habitLinks, elapsedDays, monday, today);
    const responseGoal = {
      ...goal,
      habitLinks: goal.habitLinks.map((link) => {
        const { checkIns: _checkIns, ...habit } = link.habit;
        return { ...link, habit };
      }),
    };
    res.status(200).json({ goal: responseGoal, habitCount: progress.habitCount, progress });
  } catch {
    error(res, 500, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal.");
  }
}

export async function updateGoal(req: Request, res: Response): Promise<void> {
  const parsed = updateGoalSchema.safeParse(req.body);
  if (!parsed.success)
    return error(res, 400, "VALIDATION_ERROR", "Input goal tidak valid.", parsed.error.flatten());
  const ownerId = req.user?.id;
  const id = param(req, "id");
  if (!ownerId || !id) return notFound(res);
  try {
    const data: { title?: string; description?: string | null; deadline?: Date | null } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    if (parsed.data.deadline !== undefined)
      data.deadline =
        parsed.data.deadline === null ? null : new Date(`${parsed.data.deadline}T00:00:00.000Z`);
    const updated = await prisma.goal.updateMany({ where: { id, ownerId }, data });
    if (!updated.count) return notFound(res);
    const goal = await prisma.goal.findFirst({ where: { id, ownerId }, include: goalInclude });
    if (!goal) return notFound(res);
    res.status(200).json({ goal });
  } catch {
    error(res, 500, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal.");
  }
}

export async function deleteGoal(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  const id = param(req, "id");
  if (!ownerId || !id) return notFound(res);
  try {
    const result = await prisma.goal.deleteMany({ where: { id, ownerId } });
    if (!result.count) return notFound(res);
    res.status(204).end();
  } catch {
    error(res, 500, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal.");
  }
}

export async function assignHabit(req: Request, res: Response): Promise<void> {
  const parsed = assignHabitSchema.safeParse(req.body);
  if (!parsed.success)
    return error(res, 400, "VALIDATION_ERROR", "Input habit tidak valid.", parsed.error.flatten());
  const ownerId = req.user?.id;
  const id = param(req, "id");
  if (!ownerId || !id) return notFound(res);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({ where: { id, ownerId }, select: { id: true } });
      const habit = await tx.habit.findFirst({
        where: { id: parsed.data.habitId, ownerId },
        select: { id: true },
      });
      if (!goal || !habit) return false;
      await tx.goalHabit.upsert({
        where: { goalId_habitId: { goalId: id, habitId: habit.id } },
        create: { goalId: id, habitId: habit.id },
        update: {},
      });
      return true;
    });
    if (!result) return notFound(res);
    res.status(200).json({ message: "Habit terhubung ke goal." });
  } catch {
    error(res, 500, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal.");
  }
}

export async function unassignHabit(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  const id = param(req, "id");
  const habitId = param(req, "habitId");
  if (!ownerId || !id || !habitId) return notFound(res);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({ where: { id, ownerId }, select: { id: true } });
      if (!goal) return "missing" as const;
      const habit = await tx.habit.findFirst({
        where: { id: habitId, ownerId },
        select: { id: true },
      });
      if (!habit) return "missing" as const;
      const link = await tx.goalHabit.findUnique({
        where: { goalId_habitId: { goalId: id, habitId } },
      });
      if (!link) return "missing" as const;
      const count = await tx.goalHabit.count({ where: { goalId: id } });
      if (count <= 1) return "last" as const;
      await tx.goalHabit.delete({ where: { goalId_habitId: { goalId: id, habitId } } });
      return "ok" as const;
    });
    if (result === "missing") return notFound(res);
    if (result === "last")
      return error(res, 422, "UNPROCESSABLE_ENTITY", "Goal wajib punya minimal 1 habit.");
    res.status(204).end();
  } catch {
    error(res, 500, "INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal.");
  }
}
