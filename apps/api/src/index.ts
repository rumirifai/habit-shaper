import express, { type Request, type Response } from "express";

type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type HealthResponse = {
  status: "ok";
};

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return 4000;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return 4000;
  }
  return parsed;
}

function healthPayload(): HealthResponse {
  return { status: "ok" };
}

function notFoundPayload(path: string): ApiError {
  return {
    error: {
      code: "NOT_FOUND",
      message: `Route ${path} tidak ditemukan.`,
    },
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json(healthPayload());
});

app.get("/api/v1/health", (_req: Request, res: Response) => {
  res.status(200).json(healthPayload());
});

app.use((req: Request, res: Response) => {
  res.status(404).json(notFoundPayload(req.path));
});

const port = parsePort(process.env["PORT"]);

app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on :${port}`);
});

export default app;
