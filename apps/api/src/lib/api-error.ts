import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.locals.errorCode = code;
  res.status(status).json({
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });
}

export function handleApiError(
  req: Request,
  res: Response,
  error: unknown,
  override?: { status: number; code: string; message: string },
): void {
  let status = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Terjadi kesalahan internal.";

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      status = 404;
      code = "NOT_FOUND";
      message = "Data tidak ditemukan.";
    } else if (error.code === "P2003") {
      status = 422;
      code = "UNPROCESSABLE_ENTITY";
      message = "Relasi data tidak valid.";
    } else if (error.code === "P2002") {
      status = 409;
      code = "CONFLICT";
      message = "Data bertentangan dengan data yang sudah ada.";
    } else {
      code = "DATABASE_ERROR";
      message = "Gagal memproses permintaan ke database.";
    }
  }
  if (override !== undefined) {
    status = override.status;
    code = override.code;
    message = override.message;
  }

  const startedAt = res.locals.startedAt;
  const durationMs = typeof startedAt === "number" ? Date.now() - startedAt : null;
  console.error(
    JSON.stringify({
      level: "error",
      method: req.method,
      path: req.path,
      userId: req.user?.id ?? null,
      durationMs,
      code,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }),
  );

  if (res.headersSent) return;
  sendApiError(res, status, code, message);
}
