import { Router } from "express";
import { loginAuth, logoutAuth, refreshAuth, registerAuth } from "../controllers/auth.js";
const router = Router();
router.post("/register", registerAuth);
router.post("/login", loginAuth);
router.post("/refresh", refreshAuth);
router.post("/logout", logoutAuth);

export { router as authRouter };
