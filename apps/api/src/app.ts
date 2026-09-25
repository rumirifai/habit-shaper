import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { authRouter } from "./routes/auth.js";
import { habitsRouter } from "./routes/habits.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());
app.get("/health", (_req: Request, res: Response) => res.status(200).json({ status: "ok" }));
app.get("/api/v1/health", (_req: Request, res: Response) => res.status(200).json({ status: "ok" }));
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/habits", habitsRouter);
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Route ${req.path} tidak ditemukan.` } });
});
app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Body JSON tidak valid." } });
    return;
  }
  res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
});

export default app;
