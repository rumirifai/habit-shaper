import type { RequestHandler } from "express";

export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = Date.now();
  res.locals.startedAt = startedAt;
  res.on("finish", () => {
    const statusCode = res.statusCode;
    console.log(
      JSON.stringify({
        level: statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info",
        method: req.method,
        path: req.path,
        userId: req.user?.id ?? null,
        durationMs: Date.now() - startedAt,
        code: res.locals.errorCode ?? (statusCode >= 400 ? `HTTP_${statusCode}` : "OK"),
        statusCode,
      }),
    );
  });
  next();
};
