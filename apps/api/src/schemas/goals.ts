import { z } from "zod";
import { createHabitSchema } from "./habits.js";

export const createGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    deadline: z.string().date().optional(),
    habitIds: z.array(z.string().uuid()).default([]),
    newHabits: z.array(createHabitSchema).max(5).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.habitIds.length + value.newHabits.length < 1) {
      ctx.addIssue({
        code: "custom",
        message: "Goal wajib punya minimal 1 habit: pilih habit atau buat baru.",
        path: ["habitIds"],
      });
    }
    if (new Set(value.habitIds).size !== value.habitIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "habitIds tidak boleh berisi ID duplikat.",
        path: ["habitIds"],
      });
    }
  });

export const updateGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    deadline: z.string().date().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Minimal satu field harus diisi." });

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export const assignHabitSchema = z.object({ habitId: z.string().uuid() }).strict();
export type AssignHabitInput = z.infer<typeof assignHabitSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
