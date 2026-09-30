import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { calcCurrentStreak, calcLongestStreak, calcWeekly } from "../src/services/streak.js";
import { dateOnlyToUTC, mondayOfWeekWIB, todayWIB } from "../src/utils/date.js";

type RegisteredUser = { id: string; email: string };
type LoginBody = { accessToken: string };
type ErrorBody = { error: { code: string; message: string; details?: unknown } };
type DailyStreakBody = { habitId: string; current: number; longest: number; lastDoneDate: string | null };
type WeeklyStreakBody = {
  habitId: string;
  weekStart: string;
  weekEnd: string;
  done: number;
  miss: number;
  allowance: 3;
  remaining: number;
  days: Array<{ date: string; status: "DONE" | "MISS" | "PENDING" | "FUTURE" }>;
};

const createdUserIds: string[] = [];
let sequence = 0;

async function createUser(): Promise<{ user: RegisteredUser; token: string }> {
  sequence += 1;
  const email = `streak-${Date.now()}-${sequence}@example.com`;
  const registered = await request(app).post("/api/v1/auth/register").send({
    email,
    password: "correct-horse-123",
    name: "Streak Test",
  });
  expect(registered.status).toBe(201);
  const user = registered.body.user as RegisteredUser;
  createdUserIds.push(user.id);

  const loggedIn = await request(app).post("/api/v1/auth/login").send({ email, password: "correct-horse-123" });
  expect(loggedIn.status).toBe(200);
  return { user, token: (loggedIn.body as LoginBody).accessToken };
}

async function createHabit(ownerId: string): Promise<string> {
  const habit = await prisma.habit.create({ data: { ownerId, title: "Streak habit", type: "POSITIVE" } });
  return habit.id;
}

async function createDoneDates(habitId: string, dates: string[]): Promise<Date[]> {
  if (dates.length > 0) {
    await prisma.checkIn.createMany({
      data: dates.map((date) => ({ habitId, date: dateOnlyToUTC(date), status: "DONE" as const })),
    });
  }
  return dates.map(dateOnlyToUTC);
}

function shiftDate(date: string, days: number): string {
  const value = dateOnlyToUTC(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function expectErrorEnvelope(body: unknown): ErrorBody {
  expect(body).toHaveProperty("error.code");
  expect(body).toHaveProperty("error.message");
  return body as ErrorBody;
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  }
});

describe("Streak integration", () => {
  it("STRK-I-01 GET /habits/:id/streak?range=daily -> hasil sesuai kalkulator streak", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const today = todayWIB();
    const dates = [shiftDate(today, -6), shiftDate(today, -5), shiftDate(today, -2)];
    const checkIns = await createDoneDates(habitId, dates);

    const response = await request(app)
      .get(`/api/v1/habits/${habitId}/streak`)
      .query({ range: "daily" })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const body = response.body as DailyStreakBody;
    expect(body).toEqual({
      habitId,
      current: calcCurrentStreak(checkIns, dateOnlyToUTC(today)),
      longest: calcLongestStreak(checkIns),
      lastDoneDate: dates.at(-1),
    });
  });

  it("STRK-I-02 GET /habits/:id/streak weekly -> normalisasi ke Senin dan tujuh hari", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const requestedWeek = shiftDate(todayWIB(), -10);
    const monday = mondayOfWeekWIB(requestedWeek);
    const dates = [0, 1, 3].map((offset) => shiftDate(monday, offset));
    const checkIns = await createDoneDates(habitId, dates);

    const response = await request(app)
      .get(`/api/v1/habits/${habitId}/streak`)
      .query({ range: "weekly", week: requestedWeek })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const body = response.body as WeeklyStreakBody;
    expect(body).toEqual({ habitId, ...calcWeekly(checkIns, dateOnlyToUTC(monday)) });
    expect(body.weekStart).toBe(monday);
    expect(body.weekEnd).toBe(shiftDate(monday, 6));
    expect(body.done).toBe(3);
    expect(body.allowance).toBe(3);
    expect(body.days).toHaveLength(7);
  });

  it("STRK-I-03 weekly remaining tidak negatif saat miss melebihi allowance", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const requestedWeek = shiftDate(todayWIB(), -10);
    const monday = mondayOfWeekWIB(requestedWeek);
    const doneDates = await createDoneDates(habitId, [shiftDate(monday, 0), shiftDate(monday, 1)]);

    const response = await request(app)
      .get(`/api/v1/habits/${habitId}/streak`)
      .query({ range: "weekly", week: requestedWeek })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    const body = response.body as WeeklyStreakBody;
    expect(body.miss).toBeGreaterThan(3);
    expect(body.remaining).toBe(0);
    expect(body.remaining).toBe(Math.max(0, 3 - body.miss));
  });

  it("STRK-I-04 GET /habits/:id/streak dengan week invalid -> 400 VALIDATION_ERROR envelope", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const response = await request(app)
      .get(`/api/v1/habits/${habitId}/streak`)
      .query({ range: "weekly", week: "bukan-tanggal" })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(400);
    const error = expectErrorEnvelope(response.body).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toBeDefined();
  });

  it("STRK-I-05 GET /habits/:id/streak milik user lain -> 404 NOT_FOUND envelope", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const habitId = await createHabit(owner.user.id);

    const response = await request(app)
      .get(`/api/v1/habits/${habitId}/streak`)
      .query({ range: "daily" })
      .set("Authorization", `Bearer ${outsider.token}`);

    expect(response.status).toBe(404);
    expect(expectErrorEnvelope(response.body).error.code).toBe("NOT_FOUND");
  });
});
