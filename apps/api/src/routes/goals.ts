import { Router } from "express";
import {
  assignHabit,
  createGoal,
  deleteGoal,
  getGoal,
  listGoals,
  unassignHabit,
  updateGoal,
} from "../controllers/goals.js";
import { requireAuth } from "../middleware/require-auth.js";
import { validateBody, validateParams } from "../middleware/validate-request.js";
import { assignHabitSchema, createGoalSchema, updateGoalSchema } from "../schemas/goals.js";
import { idAndHabitIdParamsSchema, idParamsSchema } from "../schemas/params.js";

const router = Router();
router.use(requireAuth);
router.get("/", listGoals);
router.post(
  "/",
  validateBody(createGoalSchema, "Input goal tidak valid.", (error) => {
  const noHabitIssue = error.issues.find(
    (issue) =>
      issue.path[0] === "habitIds" &&
      issue.message.startsWith("Goal wajib punya minimal 1 habit"),
  );
  const noHabit = noHabitIssue !== undefined && error.issues.length === 1;
    if (noHabit) {
      return {
        status: 422,
        code: "UNPROCESSABLE_ENTITY",
        message: "Goal wajib punya minimal 1 habit: pilih habit atau buat baru.",
        details: error.flatten(),
      };
    }
    return {
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Input goal tidak valid.",
      details: error.flatten(),
    };
  }),
  createGoal,
);
router.get("/:id", validateParams(idParamsSchema), getGoal);
router.patch(
  "/:id",
  validateParams(idParamsSchema),
  validateBody(updateGoalSchema, "Input goal tidak valid."),
  updateGoal,
);
router.delete("/:id", validateParams(idParamsSchema), deleteGoal);
router.post(
  "/:id/habits",
  validateParams(idParamsSchema),
  validateBody(assignHabitSchema, "Input habit tidak valid."),
  assignHabit,
);
router.delete("/:id/habits/:habitId", validateParams(idAndHabitIdParamsSchema), unassignHabit);
export { router as goalsRouter };
