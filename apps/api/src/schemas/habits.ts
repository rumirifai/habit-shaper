import { z } from "zod";

export const habitTypeSchema = z.enum(["POSITIVE", "NEGATIVE"]);

export const createHabitSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    type: habitTypeSchema,
    description: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateHabitSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Minimal satu field title atau description harus diisi.",
  });

export const deleteHabitSchema = z
  .object({
    goalReplacements: z
      .array(
        z
          .object({ goalId: z.string().uuid(), habitId: z.string().uuid() })
          .strict(),
      )
      .default([]),
    newHabit: createHabitSchema.optional(),
    newHabitGoalIds: z.array(z.string().uuid()).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const goalIds = value.goalReplacements.map(({ goalId }) => goalId);
    if (new Set(goalIds).size !== goalIds.length) {
      ctx.addIssue({ code: "custom", message: "Goal replacement tidak boleh duplikat.", path: ["goalReplacements"] });
    }
    if (new Set(value.newHabitGoalIds).size !== value.newHabitGoalIds.length) {
      ctx.addIssue({ code: "custom", message: "Goal habit baru tidak boleh duplikat.", path: ["newHabitGoalIds"] });
    }
    if (value.newHabitGoalIds.length > 0 && value.newHabit === undefined) {
      ctx.addIssue({ code: "custom", message: "Data habit baru wajib diisi.", path: ["newHabit"] });
    }
    if (value.newHabitGoalIds.length === 0 && value.newHabit !== undefined) {
      ctx.addIssue({ code: "custom", message: "Habit baru harus dipakai minimal satu goal.", path: ["newHabitGoalIds"] });
    }
    const replacementGoalIds = [
      ...value.goalReplacements.map(({ goalId }) => goalId),
      ...value.newHabitGoalIds,
    ];
    if (new Set(replacementGoalIds).size !== replacementGoalIds.length) {
      ctx.addIssue({ code: "custom", message: "Setiap goal hanya boleh memiliki satu jenis replacement.", path: ["goalReplacements"] });
    }
  });

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Tanggal harus valid dalam format YYYY-MM-DD.");

export const listHabitsQuerySchema = z.object({ date: dateSchema.optional() }).strict();

export type CreateHabitInput = z.infer<typeof createHabitSchema>;
export type UpdateHabitInput = z.infer<typeof updateHabitSchema>;
export type DeleteHabitInput = z.infer<typeof deleteHabitSchema>;
export type ListHabitsQuery = z.infer<typeof listHabitsQuerySchema>;
