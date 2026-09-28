import { Router } from "express";
import { requireAuth } from "../middleware/require-auth.js";
import { createHabit, deleteHabit, getHabit, listHabits, updateHabit } from "../controllers/habits.js";

const router = Router();
router.use(requireAuth);

router.get("/", listHabits);
router.post("/", createHabit);
router.get("/:id", getHabit);
router.patch("/:id", updateHabit);
router.delete("/:id", deleteHabit);

export { router as habitsRouter };
