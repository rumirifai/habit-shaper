import jwt, { type JwtPayload } from "jsonwebtoken";

const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_COOKIE_NAME = "refreshToken";
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AuthTokenClaims = {
  userId: string;
  tokenVersion: number;
};

function secret(name: "JWT_ACCESS_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (value === undefined || value.length < 32) {
    throw new Error(`${name} wajib disetel minimal 32 karakter.`);
  }
  return value;
}

export function issueAccessToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ tokenVersion }, secret("JWT_ACCESS_SECRET"), {
    subject: userId,
    expiresIn: ACCESS_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function issueRefreshToken(userId: string, tokenVersion: number): string {
  return jwt.sign({ tokenVersion }, secret("JWT_REFRESH_SECRET"), {
    subject: userId,
    expiresIn: "7d",
    algorithm: "HS256",
  });
}

function verifyToken(token: string, tokenSecret: string): AuthTokenClaims | null {
  try {
    const payload = jwt.verify(token, tokenSecret, { algorithms: ["HS256"] });
    if (typeof payload === "string") return null;
    const subject: JwtPayload["sub"] = payload.sub;
    const tokenVersion: unknown = payload["tokenVersion"];
    if (
      typeof subject !== "string" ||
      subject.length === 0 ||
      typeof tokenVersion !== "number" ||
      !Number.isSafeInteger(tokenVersion) ||
      tokenVersion < 0
    ) {
      return null;
    }
    return { userId: subject, tokenVersion };
  } catch (e: unknown) {
    if (e instanceof jwt.JsonWebTokenError || e instanceof jwt.TokenExpiredError) return null;
    throw e;
  }
}

export function verifyAccessToken(token: string): AuthTokenClaims | null {
  return verifyToken(token, secret("JWT_ACCESS_SECRET"));
}

export function verifyRefreshToken(token: string): AuthTokenClaims | null {
  return verifyToken(token, secret("JWT_REFRESH_SECRET"));
}
