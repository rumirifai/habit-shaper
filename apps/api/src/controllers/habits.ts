import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { createHabitSchema, updateHabitSchema } from "../schemas/habits.js";

function todayWibDate(): Date {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${date}T00:00:00.000Z`);
}

function notFound(res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Habit tidak ditemukan." } });
}

function habitIdFrom(req: Request): string | null {
  const id = req.params.id;
  return typeof id === "string" ? id : null;
}

export async function listHabits(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user?.id;
    if (ownerId === undefined) return;
    const today = todayWibDate();
    const habits = await prisma.habit.findMany({
      where: { ownerId },
      orderBy: { createdAt: "asc" },
      include: { checkIns: { where: { date: today }, select: { status: true } } },
    });
    res.status(200).json({
      habits: habits.map(({ checkIns, ...habit }) => ({
        ...habit,
        todayCheckIn: checkIns[0] ?? null,
        checkedInToday: checkIns.some((checkIn) => checkIn.status === "DONE"),
      })),
    });
  } catch (_error: unknown) {
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
  }
}

export async function getHabit(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user?.id;
    const id = habitIdFrom(req);
    if (ownerId === undefined || id === null) return notFound(res);
    const habit = await prisma.habit.findFirst({ where: { id, ownerId } });
    if (habit === null) return notFound(res);
    res.status(200).json({ habit });
  } catch (_error: unknown) {
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
  }
}

export async function createHabit(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createHabitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Input habit tidak valid.", details: parsed.error.flatten() } });
      return;
    }
    const ownerId = req.user?.id;
    if (ownerId === undefined) return;
    const habit = await prisma.habit.create({
      data: {
        ownerId,
        title: parsed.data.title,
        type: parsed.data.type,
        description: parsed.data.description ?? null,
      },
    });
    res.status(201).json({ habit });
  } catch (_error: unknown) {
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
  }
}

export async function updateHabit(req: Request, res: Response): Promise<void> {
  try {
    const parsed = updateHabitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Input habit tidak valid.", details: parsed.error.flatten() } });
      return;
    }
    const ownerId = req.user?.id;
    const id = habitIdFrom(req);
    if (ownerId === undefined || id === null) return notFound(res);
    const data: { title?: string; description?: string | null } = {};
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.description !== undefined) data.description = parsed.data.description;
    const result = await prisma.habit.updateMany({ where: { id, ownerId }, data });
    if (result.count === 0) return notFound(res);
    const habit = await prisma.habit.findFirst({ where: { id, ownerId } });
    if (habit === null) return notFound(res);
    res.status(200).json({ habit });
  } catch (_error: unknown) {
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
  }
}

export async function deleteHabit(req: Request, res: Response): Promise<void> {
  try {
    const ownerId = req.user?.id;
    const id = habitIdFrom(req);
    if (ownerId === undefined || id === null) return notFound(res);
    const result = await prisma.habit.deleteMany({ where: { id, ownerId } });
    if (result.count === 0) return notFound(res);
    res.status(204).end();
  } catch (_error: unknown) {
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
  }
}
