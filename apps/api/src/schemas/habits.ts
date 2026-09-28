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

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
