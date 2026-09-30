import { Router } from "express";
import { assignHabit, createGoal, deleteGoal, getGoal, listGoals, unassignHabit, updateGoal } from "../controllers/goals.js";
import { requireAuth } from "../middleware/require-auth.js";

const router = Router();
router.use(requireAuth);
router.get("/", listGoals);
router.post("/", createGoal);
router.get("/:id", getGoal);
router.patch("/:id", updateGoal);
router.delete("/:id", deleteGoal);
router.post("/:id/habits", assignHabit);
router.delete("/:id/habits/:habitId", unassignHabit);
export { router as goalsRouter };
