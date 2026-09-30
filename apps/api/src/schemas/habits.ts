import { z } from "zod";

export const habitTypeSchema = z.enum(["POSITIVE", "NEGATIVE"]);

export const createHabitSchema = z.object({
  title: z.string().trim().min(1).max(120),
  type: habitTypeSchema,
  description: z.string().trim().max(500).optional(),
}).strict();

export const updateHabitSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "Minimal satu field title atau description harus diisi.",
});

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Tanggal harus valid dalam format YYYY-MM-DD.");

export const listHabitsQuerySchema = z.object({ date: dateSchema.optional() }).strict();

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
