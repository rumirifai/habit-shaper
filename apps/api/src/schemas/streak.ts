import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Tanggal harus valid dalam format YYYY-MM-DD.");

export const getStreakQuerySchema = z.object({
  range: z.enum(["daily", "weekly"]).default("daily"),
  week: dateSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.range === "daily" && value.week !== undefined) {
    context.addIssue({
      code: "custom",
      message: "Parameter week hanya dapat digunakan dengan range=weekly.",
      path: ["week"],
    });
  }
});

export type GetStreakQuery = z.infer<typeof getStreakQuerySchema>;
