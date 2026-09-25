import { Router, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  issueAccessToken,
  issueRefreshToken,
  REFRESH_COOKIE_NAME,
  REFRESH_TTL_MS,
  verifyRefreshToken,
} from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

const registerSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100).optional(),
}).strict();
type RegisterInput = z.infer<typeof registerSchema>;

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(128),
}).strict();
type LoginInput = z.infer<typeof loginSchema>;

const router = Router();
const cookieOptions = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/api/v1/auth",
};

function validationFailure(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: { code: "VALIDATION_ERROR", message: "Input tidak valid.", details: error.flatten() },
  });
}

function unexpectedError(res: Response): void {
  res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Terjadi kesalahan internal." } });
}

router.post("/register", async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return validationFailure(res, parsed.error);
  const input: RegisterInput = parsed.data;
  try {
    const passwordHash = await bcrypt.hash(input.password, 12);
    const user = await prisma.user.create({
      data: { email: input.email, passwordHash, ...(input.name === undefined ? {} : { name: input.name }) },
      select: { id: true, email: true, name: true },
    });
    res.status(201).json({ user });
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      res.status(409).json({ error: { code: "CONFLICT", message: "Email sudah terdaftar." } });
      return;
    }
    unexpectedError(res);
  }
});

router.post("/login", async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return validationFailure(res, parsed.error);
  const input: LoginInput = parsed.data;
  try {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, name: true, passwordHash: true, tokenVersion: true },
    });
    if (user === null || !(await bcrypt.compare(input.password, user.passwordHash))) {
      res.status(401).json({ error: { code: "INVALID_CREDENTIALS", message: "Email atau password salah." } });
      return;
    }
    res.cookie(REFRESH_COOKIE_NAME, issueRefreshToken(user.id, user.tokenVersion), {
      ...cookieOptions,
      maxAge: REFRESH_TTL_MS,
    });
    res.status(200).json({
      accessToken: issueAccessToken(user.id, user.tokenVersion),
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (e: unknown) {
    void e;
    unexpectedError(res);
  }
});

router.post("/refresh", async (req: Request, res: Response) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({
      error: { code: "REFRESH_COOKIE_MISSING", message: "Refresh cookie tidak ditemukan." },
    });
    return;
  }
  try {
    const claims = verifyRefreshToken(token);
    if (claims === null) {
      res.status(401).json({
        error: { code: "INVALID_REFRESH_TOKEN", message: "Refresh token tidak valid atau kedaluwarsa." },
      });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, email: true, name: true, passwordHash: true, tokenVersion: true },
    });
    if (user === null || user.tokenVersion !== claims.tokenVersion) {
      res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
      res.status(401).json({
        error: { code: "REFRESH_TOKEN_REVOKED", message: "Sesi sudah dicabut. Silakan login kembali." },
      });
      return;
    }
    res.status(200).json({
      accessToken: issueAccessToken(user.id, user.tokenVersion),
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (e: unknown) {
    void e;
    unexpectedError(res);
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  try {
    if (typeof token === "string" && token.length > 0) {
      const claims = verifyRefreshToken(token);
      if (claims !== null) {
        await prisma.user.updateMany({
          where: { id: claims.userId, tokenVersion: claims.tokenVersion },
          data: { tokenVersion: { increment: 1 } },
        });
      }
    }
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
    res.status(204).end();
  } catch (e: unknown) {
    void e;
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
    res.status(500).json({
      error: { code: "LOGOUT_FAILED", message: "Logout gagal diproses. Silakan coba lagi." },
    });
  }
});

export { router as authRouter };
