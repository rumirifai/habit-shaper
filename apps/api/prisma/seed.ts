// prisma/seed.ts — seed dev: 1 user demo (SAD Phase 1). Non-prod only.
// Dijalankan via `npx prisma db seed` (lihat "prisma.seed" di package.json).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DEMO_EMAIL = "demo@habitshaper.com";
const DEMO_PASSWORD = "demo123";
const SALT_ROUNDS = 10;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash: string = await bcrypt.hash(DEMO_PASSWORD, SALT_ROUNDS);
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: "Demo",
      tokenVersion: 0,
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[seed] demo user ready: ${user.email}`);
}

try {
  await main();
} catch (e: unknown) {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`[seed] failed: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
