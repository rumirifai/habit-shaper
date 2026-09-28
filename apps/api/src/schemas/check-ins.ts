import { z } from "zod";
import { todayWIB } from "../utils/date.js";

export const checkInSchema = z.object({
  date: z.string().date().optional().transform((date) => date ?? todayWIB()),
}).strict();

export type CheckInInput = z.infer<typeof checkInSchema>;
