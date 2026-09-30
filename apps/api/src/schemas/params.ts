import { z } from "zod";

export const idParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const idAndHabitIdParamsSchema = z
  .object({
    id: z.string().uuid(),
    habitId: z.string().uuid(),
  })
  .strict();

export type IdParams = z.infer<typeof idParamsSchema>;
export type IdAndHabitIdParams = z.infer<typeof idAndHabitIdParamsSchema>;
