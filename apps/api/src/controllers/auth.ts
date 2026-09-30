import { Prisma } from "@prisma/client";
import argon2 from "argon2";
import type { Request, Response } from "express";
import { handleApiError, sendApiError } from "../lib/api-error.js";
import {
  issueAccessToken,
  issueRefreshToken,
  REFRESH_COOKIE_NAME,
  REFRESH_TTL_MS,
  verifyRefreshToken,
} from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";
import type { LoginInput, RegisterInput } from "../schemas/auth.js";
import { validatedBody } from "../middleware/validate-request.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "lax" as const,
  path: "/api/v1/auth",
};

export async function registerAuth(req: Request, res: Response): Promise<void> {
  const input = validatedBody<RegisterInput>(res);
  try {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        ...(input.name === undefined ? {} : { name: input.name }),
      },
      select: { id: true, email: true, name: true },
    });
    res.status(201).json({ user });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      sendApiError(res, 409, "CONFLICT", "Email sudah terdaftar.");
      return;
    }
    handleApiError(req, res, error);
  }
}

export async function loginAuth(req: Request, res: Response): Promise<void> {
  const input = validatedBody<LoginInput>(res);
  try {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true, name: true, passwordHash: true, tokenVersion: true },
    });
    if (user === null || !(await argon2.verify(user.passwordHash, input.password))) {
      sendApiError(res, 401, "INVALID_CREDENTIALS", "Email atau password salah.");
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
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

export async function refreshAuth(req: Request, res: Response): Promise<void> {
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
      sendApiError(
        res,
        401,
        "INVALID_REFRESH_TOKEN",
        "Refresh token tidak valid atau kedaluwarsa.",
      );
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, email: true, name: true, tokenVersion: true },
    });
    if (user === null || user.tokenVersion !== claims.tokenVersion) {
      res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
      sendApiError(res, 401, "REFRESH_TOKEN_REVOKED", "Sesi sudah dicabut. Silakan login kembali.");
      return;
    }
    res.status(200).json({
      accessToken: issueAccessToken(user.id, user.tokenVersion),
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error: unknown) {
    handleApiError(req, res, error);
  }
}

export async function logoutAuth(req: Request, res: Response): Promise<void> {
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
  } catch (error: unknown) {
    res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
    handleApiError(req, res, error, {
      status: 500,
      code: "LOGOUT_FAILED",
      message: "Logout gagal diproses. Silakan coba lagi.",
    });
  }
}
