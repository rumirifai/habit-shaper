import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

type RegisteredUser = { id: string; email: string };
type LoginBody = { accessToken: string };
type CheckInBody = { habitId: string; date: string; streak: { current: number; longest: number } };
type ErrorBody = { error: { code: string; message: string; details?: unknown } };

const createdUserIds: string[] = [];
let sequence = 0;

async function createUser(): Promise<{ user: RegisteredUser; token: string }> {
  sequence += 1;
  const email = `checkin-${Date.now()}-${sequence}@example.com`;
  const registered = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "correct-horse-123", name: "Check-in Test" });
  expect(registered.status).toBe(201);
  const user = registered.body.user as RegisteredUser;
  createdUserIds.push(user.id);

  const loggedIn = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "correct-horse-123" });
  expect(loggedIn.status).toBe(200);
  return { user, token: (loggedIn.body as LoginBody).accessToken };
}

async function createHabit(
  ownerId: string,
  type: "POSITIVE" | "NEGATIVE" = "POSITIVE",
): Promise<string> {
  const habit = await prisma.habit.create({ data: { ownerId, title: "Check-in habit", type } });
  return habit.id;
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

describe("Check-in and undo integration", () => {
  it("CHK-I-01 POST /habits/:id/check-in tanpa body -> 200 dengan streak hari ini WIB", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);

    const response = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body as CheckInBody).toMatchObject({
      habitId,
      date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      streak: { current: 1, longest: 1 },
    });
    expect(await prisma.checkIn.count({ where: { habitId } })).toBe(1);
  });

  it("CHK-I-02 POST /habits/:id/check-in berulang -> idempotent tanpa baris duplikat", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const first = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`);
    const second = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(await prisma.checkIn.count({ where: { habitId } })).toBe(1);
  });

  it("CHK-I-10 concurrent check-ins remain idempotent with one database row", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const responses = await Promise.all([
      request(app)
        .post(`/api/v1/habits/${habitId}/check-in`)
        .set("Authorization", `Bearer ${token}`),
      request(app)
        .post(`/api/v1/habits/${habitId}/check-in`)
        .set("Authorization", `Bearer ${token}`),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(responses[0]?.body).toEqual(responses[1]?.body);
    expect(await prisma.checkIn.count({ where: { habitId } })).toBe(1);
  });

  it("CHK-I-03 POST /habits/:id/check-in untuk NEGATIVE -> DONE (hari bersih)", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id, "NEGATIVE");
    const response = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body as CheckInBody).toMatchObject({
      habitId,
      streak: { current: 1, longest: 1 },
    });
    expect(
      await prisma.checkIn.findUnique({
        where: {
          habitId_date: {
            habitId,
            date: new Date(`${(response.body as CheckInBody).date}T00:00:00.000Z`),
          },
        },
      }),
    ).toMatchObject({ status: "DONE" });
  });

  it("CHK-I-04 POST /habits/:id/check-in tanggal masa depan -> 422 FUTURE_DATE envelope", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const future = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: future });

    expect(response.status).toBe(422);
    expect(expectErrorEnvelope(response.body).error.code).toBe("FUTURE_DATE");
  });

  it("CHK-I-05 POST /habits/:id/check-in tanggal lampau -> 422 BACKFILL_NOT_ALLOWED envelope", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`)
      .send({ date: past });

    expect(response.status).toBe(422);
    expect(expectErrorEnvelope(response.body).error.code).toBe("BACKFILL_NOT_ALLOWED");
  });

  it("CHK-I-06 POST /habits/:id/check-in milik user lain -> 404 NOT_FOUND envelope", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const habitId = await createHabit(owner.user.id);
    const response = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${outsider.token}`);

    expect(response.status).toBe(404);
    expect(expectErrorEnvelope(response.body).error.code).toBe("NOT_FOUND");
  });

  it("CHK-I-07 DELETE /habits/:id/check-in hari ini -> 204 dan baris terhapus", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const created = await request(app)
      .post(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`);
    const date = (created.body as CheckInBody).date;
    const response = await request(app)
      .delete(`/api/v1/habits/${habitId}/check-in`)
      .query({ date })
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(await prisma.checkIn.count({ where: { habitId } })).toBe(0);
  });

  it.each([
    { label: "tanggal lampau", offsetDays: -1, code: "BACKFILL_NOT_ALLOWED" },
    { label: "tanggal masa depan", offsetDays: 1, code: "FUTURE_DATE" },
  ])(
    "CHK-I-08 DELETE /habits/:id/check-in $label -> 422 envelope",
    async ({ offsetDays, code }) => {
      const { user, token } = await createUser();
      const habitId = await createHabit(user.id);
      const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const response = await request(app)
        .delete(`/api/v1/habits/${habitId}/check-in`)
        .query({ date })
        .set("Authorization", `Bearer ${token}`);

      expect(response.status).toBe(422);
      expect(expectErrorEnvelope(response.body).error.code).toBe(code);
    },
  );

  it("CHK-I-09 DELETE /habits/:id/check-in tanpa baris check-in -> 204 idempotent", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const response = await request(app)
      .delete(`/api/v1/habits/${habitId}/check-in`)
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");
  });
});
