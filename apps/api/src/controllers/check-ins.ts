import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { checkInSchema } from "../schemas/check-ins.js";
import { dateOnlyToUTC, todayWIB } from "../utils/date.js";

function habitIdFrom(req: Request): string | null {
  const id = req.params.id;
  return typeof id === "string" ? id : null;
}

function notFound(res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Habit tidak ditemukan." } });
}

function validateCheckInDate(date: string, today: string, res: Response): boolean {
  if (date > today) {
    res.status(422).json({ error: { code: "FUTURE_DATE", message: "Tanggal check-in tidak boleh di masa depan." } });
    return false;
  }
  if (date < today) {
    res.status(422).json({ error: { code: "BACKFILL_NOT_ALLOWED", message: "Check-in untuk tanggal lampau tidak diizinkan." } });
    return false;
  }
  return true;
}

function handleCheckInError(res: Response, error: unknown): void {
  if (res.headersSent) return;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    res.status(500).json({ error: { code: "DATABASE_ERROR", message: "Gagal memproses check-in." } });
    return;
  }
  res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
}

export async function createCheckIn(req: Request, res: Response): Promise<void> {
  try {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Tanggal check-in tidak valid.", details: parsed.error.flatten() } });
    return;
  }

  const ownerId = req.user?.id;
  const habitId = habitIdFrom(req);
  if (ownerId === undefined || habitId === null) return notFound(res);
  if (await prisma.habit.findFirst({ where: { id: habitId, ownerId }, select: { id: true } }) === null) return notFound(res);

  const today = todayWIB();
  if (!validateCheckInDate(parsed.data.date, today, res)) return;

  const date = dateOnlyToUTC(parsed.data.date);
  try {
    const checkIn = await prisma.checkIn.upsert({
      where: { habitId_date: { habitId, date } },
      create: { habitId, date, status: "DONE" },
      update: { status: "DONE" },
      select: { habitId: true, date: true, status: true },
    });
    res.status(200).json({ checkIn: { ...checkIn, date: parsed.data.date } });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const checkIn = await prisma.checkIn.findUnique({
        where: { habitId_date: { habitId, date } },
        select: { habitId: true, date: true, status: true },
      });
      if (checkIn !== null) {
        res.status(200).json({ checkIn: { ...checkIn, date: parsed.data.date } });
        return;
      }
    }
    throw error;
  }
  } catch (error: unknown) {
    handleCheckInError(res, error);
  }
}

export async function deleteCheckIn(req: Request, res: Response): Promise<void> {
  try {
  const parsed = checkInSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Tanggal check-in tidak valid.", details: parsed.error.flatten() } });
    return;
  }

  const ownerId = req.user?.id;
  const habitId = habitIdFrom(req);
  if (ownerId === undefined || habitId === null) return notFound(res);
  if (await prisma.habit.findFirst({ where: { id: habitId, ownerId }, select: { id: true } }) === null) return notFound(res);

  const today = todayWIB();
  if (!validateCheckInDate(parsed.data.date, today, res)) return;

  await prisma.checkIn.deleteMany({
    where: { habitId, date: dateOnlyToUTC(parsed.data.date), status: "DONE" },
  });
  res.status(204).end();
  } catch (error: unknown) {
    handleCheckInError(res, error);
  }
}
