import { Router } from "express";
import { loginAuth, logoutAuth, refreshAuth, registerAuth } from "../controllers/auth.js";
import { validateBody } from "../middleware/validate-request.js";
import { loginSchema, registerSchema } from "../schemas/auth.js";

const router = Router();
router.post("/register", validateBody(registerSchema), registerAuth);
router.post("/login", validateBody(loginSchema), loginAuth);
router.post("/refresh", refreshAuth);
router.post("/logout", logoutAuth);

export { router as authRouter };
