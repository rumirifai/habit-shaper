import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  try {
    const claims = token === "" ? null : verifyAccessToken(token);
    if (claims === null) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Access token tidak valid atau kedaluwarsa." },
      });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, tokenVersion: true },
    });
    if (user === null || user.tokenVersion !== claims.tokenVersion) {
      res.status(401).json({
        error: { code: "SESSION_REVOKED", message: "Sesi sudah dicabut. Silakan login kembali." },
      });
      return;
    }
    req.user = { id: user.id };
    next();
  } catch (e: unknown) {
    void e;
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Gagal memvalidasi sesi." } });
  }
}
