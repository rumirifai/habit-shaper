import type { Request, Response } from "express";
import { handleApiError, sendApiError } from "../lib/api-error.js";
import { prisma } from "../lib/prisma.js";
import { validatedBody, validatedParams } from "../middleware/validate-request.js";
import type { AssignHabitInput, CreateGoalInput, UpdateGoalInput } from "../schemas/goals.js";
import type { IdAndHabitIdParams, IdParams } from "../schemas/params.js";
import { calculateGoalProgress } from "../services/goal-progress.js";
import { dateOnlyToUTC, mondayOfWeekWIB, todayWIB } from "../utils/date.js";

function error(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  sendApiError(res, status, code, message, details);
}
function notFound(res: Response): void {
  error(res, 404, "NOT_FOUND", "Goal atau habit tidak ditemukan.");
}
const goalInclude = {
  habitLinks: {
    include: { habit: { select: { id: true, title: true, type: true, description: true } } },
  },
} as const;

export async function createGoal(req: Request, res: Response): Promise<void> {
  const input = validatedBody<CreateGoalInput>(res);
  const ownerId = req.user?.id;
  if (!ownerId) {
    sendApiError(res, 401, "UNAUTHORIZED", "Autentikasi diperlukan.");
    return;
  }
  try {
    const goal = await prisma.$transaction(async (tx) => {
      const found = await tx.habit.findMany({
        where: { id: { in: input.habitIds }, ownerId },
        select: { id: true },
      });
      if (found.length !== new Set(input.habitIds).size) return null;
      const created = await tx.goal.create({
        data: {
          ownerId,
          title: input.title,
          description: input.description ?? null,
          deadline: input.deadline ? new Date(`${input.deadline}T00:00:00.000Z`) : null,
        },
      });
      const inline = await Promise.all(
        input.newHabits.map((habit) =>
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
  } catch (caught: unknown) {
    handleApiError(req, res, caught);
  }
}

export async function listGoals(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  if (!ownerId) {
    sendApiError(res, 401, "UNAUTHORIZED", "Autentikasi diperlukan.");
    return;
  }
  try {
    const today = todayWIB();
    const monday = mondayOfWeekWIB(today);
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
                createdAt: true,
                checkIns: {
                  where: { date: { gte: dateOnlyToUTC(monday), lte: dateOnlyToUTC(today) } },
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
        const progress = calculateGoalProgress(
          goal.id,
          goal.habitLinks.map(({ habit }) => habit),
          monday,
          today,
        );
        return {
          ...goal,
          habitLinks: goal.habitLinks.map((link) => {
            const { checkIns: _checkIns, createdAt: _createdAt, ...habit } = link.habit;
            return { ...link, habit };
          }),
          habitCount,
          progress,
        };
      }),
    });
  } catch (caught: unknown) {
    handleApiError(req, res, caught);
  }
}

export async function getGoal(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  const { id } = validatedParams<IdParams>(res);
  if (!ownerId || !id) return notFound(res);
  try {
    const today = todayWIB();
    const monday = mondayOfWeekWIB(today);
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
                createdAt: true,
                checkIns: {
                  where: { date: { gte: dateOnlyToUTC(monday), lte: dateOnlyToUTC(today) } },
                  select: { date: true, status: true },
                },
              },
            },
          },
        },
      },
    });
    if (!goal) return notFound(res);
    const progress = calculateGoalProgress(
      goal.id,
      goal.habitLinks.map(({ habit }) => habit),
      monday,
      today,
    );
    const responseGoal = {
      ...goal,
      habitLinks: goal.habitLinks.map((link) => {
        const { checkIns: _checkIns, createdAt: _createdAt, ...habit } = link.habit;
        return { ...link, habit };
      }),
    };
    res.status(200).json({ goal: responseGoal, habitCount: progress.habitCount, progress });
  } catch (caught: unknown) {
    handleApiError(req, res, caught);
  }
}

export async function updateGoal(req: Request, res: Response): Promise<void> {
  const input = validatedBody<UpdateGoalInput>(res);
  const ownerId = req.user?.id;
  const { id } = validatedParams<IdParams>(res);
  if (!ownerId || !id) return notFound(res);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.goal.findFirst({
        where: { id, ownerId },
        include: { habitLinks: { select: { habitId: true } } },
      });
      if (!current) return { status: "missing" as const };

      const requestedHabitIds = [...new Set([...input.addHabitIds, ...input.removeHabitIds])];
      if (requestedHabitIds.length > 0) {
        const ownedHabits = await tx.habit.findMany({
          where: { id: { in: requestedHabitIds }, ownerId },
          select: { id: true },
        });
        if (ownedHabits.length !== requestedHabitIds.length) return { status: "missing" as const };
      }

      const removed = new Set(input.removeHabitIds);
      const remainingHabitIds = current.habitLinks
        .map(({ habitId }) => habitId)
        .filter((habitId) => !removed.has(habitId));
      const nextHabitIds = new Set([...remainingHabitIds, ...input.addHabitIds]);
      if (nextHabitIds.size + input.newHabits.length < 1) return { status: "last" as const };

      const data: { title?: string; description?: string | null; deadline?: Date | null } = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.deadline !== undefined)
        data.deadline =
          input.deadline === null ? null : new Date(`${input.deadline}T00:00:00.000Z`);
      if (Object.keys(data).length > 0) await tx.goal.update({ where: { id }, data });

      if (input.removeHabitIds.length > 0) {
        await tx.goalHabit.deleteMany({
          where: { goalId: id, habitId: { in: input.removeHabitIds } },
        });
      }

      const createdHabits = await Promise.all(
        input.newHabits.map((habit) =>
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
      const habitIdsToConnect = [
        ...new Set([...input.addHabitIds, ...createdHabits.map(({ id: habitId }) => habitId)]),
      ];
      if (habitIdsToConnect.length > 0) {
        await tx.goalHabit.createMany({
          data: habitIdsToConnect.map((habitId) => ({ goalId: id, habitId })),
          skipDuplicates: true,
        });
      }

      const goal = await tx.goal.findFirst({ where: { id, ownerId }, include: goalInclude });
      return goal
        ? {
            status: "ok" as const,
            goal,
            createdHabitIds: createdHabits.map(({ id: habitId }) => habitId),
          }
        : { status: "missing" as const };
    });
    if (result.status === "missing") return notFound(res);
    if (result.status === "last")
      return error(res, 422, "UNPROCESSABLE_ENTITY", "Goal wajib punya minimal 1 habit.");
    res.status(200).json({ goal: result.goal, createdHabitIds: result.createdHabitIds });
  } catch (caught: unknown) {
    handleApiError(req, res, caught);
  }
}

export async function deleteGoal(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  const { id } = validatedParams<IdParams>(res);
  if (!ownerId || !id) return notFound(res);
  try {
    const result = await prisma.goal.deleteMany({ where: { id, ownerId } });
    if (!result.count) return notFound(res);
    res.status(204).end();
  } catch (caught: unknown) {
    handleApiError(req, res, caught);
  }
}

export async function assignHabit(req: Request, res: Response): Promise<void> {
  const input = validatedBody<AssignHabitInput>(res);
  const ownerId = req.user?.id;
  const { id } = validatedParams<IdParams>(res);
  if (!ownerId || !id) return notFound(res);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const goal = await tx.goal.findFirst({ where: { id, ownerId }, select: { id: true } });
      const habit = await tx.habit.findFirst({
        where: { id: input.habitId, ownerId },
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
  } catch (caught: unknown) {
    handleApiError(req, res, caught);
  }
}

export async function unassignHabit(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.id;
  const { id, habitId } = validatedParams<IdAndHabitIdParams>(res);
  if (!ownerId) return notFound(res);
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
  } catch (caught: unknown) {
    handleApiError(req, res, caught);
  }
}
