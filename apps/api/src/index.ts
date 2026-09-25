import cookieParser from "cookie-parser";
import express, { type Request, type Response } from "express";
import { authRouter } from "./routes/auth.js";

type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

type HealthResponse = { status: "ok" };

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return 4000;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : 4000;
}

function errorPayload(code: string, message: string): ApiError {
  return { error: { code, message } };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req: Request, res: Response) => {
  const payload: HealthResponse = { status: "ok" };
  res.status(200).json(payload);
});
app.get("/api/v1/health", (_req: Request, res: Response) => {
  const payload: HealthResponse = { status: "ok" };
  res.status(200).json(payload);
});
app.use("/api/v1/auth", authRouter);
app.use((req: Request, res: Response) => {
  res.status(404).json(errorPayload("NOT_FOUND", `Route ${req.path} tidak ditemukan.`));
});
app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) {
    res.status(400).json(errorPayload("VALIDATION_ERROR", "Body JSON tidak valid."));
    return;
  }
  res.status(500).json(errorPayload("INTERNAL_SERVER_ERROR", "Terjadi kesalahan internal."));
});

const port = parsePort(process.env["PORT"]);
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
});

export default app;
