import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { createHabit, deleteHabit, getHabit, listHabits, updateHabit } from "../controllers/habits.js";
import { createCheckIn, deleteCheckIn } from "../controllers/check-ins.js";
import { getStreak } from "../controllers/streak.js";

const router = Router();
router.use(requireAuth);

router.get("/", listHabits);
router.post("/", createHabit);
router.get("/:id", getHabit);
router.patch("/:id", updateHabit);
router.delete("/:id", deleteHabit);
router.post("/:id/check-in", createCheckIn);
router.delete("/:id/check-in", deleteCheckIn);
router.get("/:id/streak", getStreak);

export { router as habitsRouter };
