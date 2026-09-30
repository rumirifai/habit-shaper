import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { authRouter } from "./routes/auth.js";
import { habitsRouter } from "./routes/habits.js";
import { goalsRouter } from "./routes/goals.js";
import { handleApiError, sendApiError } from "./lib/api-error.js";
import { requestLogger } from "./middleware/request-logger.js";

const app = express();
app.disable("x-powered-by");
app.use(requestLogger);
app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req: Request, res: Response) => res.status(200).json({ status: "ok" }));
app.get("/api/v1/health", (_req: Request, res: Response) => res.status(200).json({ status: "ok" }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/habits", habitsRouter);
app.use("/api/v1/goals", goalsRouter);
app.use((req: Request, res: Response) => {
  sendApiError(res, 404, "NOT_FOUND", `Route ${req.path} tidak ditemukan.`);
});
app.use((error: unknown, req: Request, res: Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    sendApiError(res, 400, "VALIDATION_ERROR", "Body JSON tidak valid.");
    return;
  }
  handleApiError(req, res, error);
});

export default app;
