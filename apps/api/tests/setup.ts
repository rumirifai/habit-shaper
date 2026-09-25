import { afterAll, beforeAll } from "vitest";
import { prisma } from "../src/lib/prisma.js";

process.env["TZ"] = "Asia/Jakarta";
process.env["JWT_ACCESS_SECRET"] ??= "test-access-secret-must-be-at-least-32-characters";
process.env["JWT_REFRESH_SECRET"] ??= "test-refresh-secret-must-be-at-least-32-characters";

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});
