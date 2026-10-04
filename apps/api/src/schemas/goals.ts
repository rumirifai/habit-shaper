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
    addHabitIds: z.array(z.string().uuid()).default([]),
    removeHabitIds: z.array(z.string().uuid()).default([]),
    newHabits: z.array(createHabitSchema).max(5).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.description === undefined && value.deadline === undefined &&
      value.addHabitIds.length === 0 && value.removeHabitIds.length === 0 && value.newHabits.length === 0) {
      ctx.addIssue({ code: "custom", message: "Minimal satu perubahan harus diisi." });
    }
    for (const [field, ids] of [["addHabitIds", value.addHabitIds], ["removeHabitIds", value.removeHabitIds]] as const) {
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: "custom", message: `${field} tidak boleh berisi ID duplikat.`, path: [field] });
      }
    }
    if (value.addHabitIds.some((id) => value.removeHabitIds.includes(id))) {
      ctx.addIssue({ code: "custom", message: "Habit yang sama tidak dapat ditambah dan dilepas bersamaan.", path: ["addHabitIds"] });
    }
  });

export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
export const assignHabitSchema = z.object({ habitId: z.string().uuid() }).strict();
export type AssignHabitInput = z.infer<typeof assignHabitSchema>;
export type CreateGoalInput = z.infer<typeof createGoalSchema>;
