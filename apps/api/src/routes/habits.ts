import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import {
  createHabit,
  deleteHabit,
  getHabit,
  listHabits,
  updateHabit,
} from "../controllers/habits.js";
import { createCheckIn, deleteCheckIn } from "../controllers/check-ins.js";
import { getStreak } from "../controllers/streak.js";
import { validateBody, validateParams, validateQuery } from "../middleware/validate-request.js";
import { checkInSchema } from "../schemas/check-ins.js";
import { createHabitSchema, listHabitsQuerySchema, updateHabitSchema } from "../schemas/habits.js";
import { getStreakQuerySchema } from "../schemas/streak.js";
import { idParamsSchema } from "../schemas/params.js";

const router = Router();
router.use(requireAuth);

router.get(
  "/",
  validateQuery(listHabitsQuerySchema, "Query daftar habit tidak valid."),
  listHabits,
);
router.post("/", validateBody(createHabitSchema, "Input habit tidak valid."), createHabit);
router.get("/:id", validateParams(idParamsSchema), getHabit);
router.patch(
  "/:id",
  validateParams(idParamsSchema),
  validateBody(updateHabitSchema, "Input habit tidak valid."),
  updateHabit,
);
router.delete("/:id", validateParams(idParamsSchema), deleteHabit);
router.post(
  "/:id/check-in",
  validateParams(idParamsSchema),
  validateBody(checkInSchema, "Tanggal check-in tidak valid."),
  createCheckIn,
);
router.delete(
  "/:id/check-in",
  validateParams(idParamsSchema),
  validateQuery(checkInSchema, "Tanggal check-in tidak valid."),
  deleteCheckIn,
);
router.get(
  "/:id/streak",
  validateParams(idParamsSchema),
  validateQuery(getStreakQuerySchema, "Query streak tidak valid."),
  getStreak,
);

export { router as habitsRouter };
