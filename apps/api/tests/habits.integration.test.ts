import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { dateOnlyToUTC, todayWIB } from "../src/utils/date.js";

type RegisteredUser = { id: string; email: string };
type ErrorBody = { error: { code: string; message: string; details?: unknown } };
type LoginBody = { accessToken: string };
type HabitBody = {
  habit: {
    id: string;
    ownerId: string;
    title: string;
    type: "POSITIVE" | "NEGATIVE";
    description: string | null;
    streak?: { current: number; longest: number; lastDoneDate: string | null };
  };
};

const createdUserIds: string[] = [];
let sequence = 0;

async function createUser(): Promise<{ user: RegisteredUser; token: string }> {
  sequence += 1;
  const email = `habit-${Date.now()}-${sequence}@example.com`;
  const registered = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "correct-horse-123", name: "Habit Test" });
  expect(registered.status).toBe(201);

  const user = registered.body.user as RegisteredUser;
  createdUserIds.push(user.id);
  const loggedIn = await request(app)
    .post("/api/v1/auth/login")
    .send({ email, password: "correct-horse-123" });
  expect(loggedIn.status).toBe(200);
  return { user, token: (loggedIn.body as LoginBody).accessToken };
}

function errorBody(body: unknown): ErrorBody {
  expect(body).toHaveProperty("error.code");
  expect(body).toHaveProperty("error.message");
  return body as ErrorBody;
}

afterEach(async () => {
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
  }
});

describe("Habits integration", () => {
  it.each(["POSITIVE", "NEGATIVE"] as const)(
    "HAB-I-01/02 POST /habits %s -> 201 dan ownerId terisolasi",
    async (type) => {
      const { user, token } = await createUser();
      const response = await request(app)
        .post("/api/v1/habits")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Habit test", type, description: "Integration test" });

      expect(response.status).toBe(201);
      const habit = (response.body as HabitBody).habit;
      expect(habit).toMatchObject({
        ownerId: user.id,
        title: "Habit test",
        type,
        description: "Integration test",
      });
      expect(await prisma.habit.findUnique({ where: { id: habit.id } })).toMatchObject({
        ownerId: user.id,
        type,
      });
    },
  );

  it.each([
    { title: "", type: "POSITIVE" },
    { title: "Valid title", type: "INVALID" },
  ])("HAB-I-03 POST /habits input invalid -> 400 VALIDATION_ERROR envelope", async (payload) => {
    const { token } = await createUser();
    const response = await request(app)
      .post("/api/v1/habits")
      .set("Authorization", `Bearer ${token}`)
      .send(payload);
    expect(response.status).toBe(400);
    const error = errorBody(response.body).error;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toBeDefined();
  });

  it("HAB-I-04 GET /habits -> hanya habit user login dan menyertakan status hari ini", async () => {
    const owner = await createUser();
    const other = await createUser();
    await prisma.habit.create({
      data: { ownerId: owner.user.id, title: "Mine", type: "POSITIVE" },
    });
    await prisma.habit.create({
      data: { ownerId: other.user.id, title: "Theirs", type: "NEGATIVE" },
    });

    const response = await request(app)
      .get("/api/v1/habits")
      .set("Authorization", `Bearer ${owner.token}`);
    expect(response.status).toBe(200);
    expect(response.body.habits).toHaveLength(1);
    expect(response.body.habits[0]).toMatchObject({
      ownerId: owner.user.id,
      checkIn: null,
      checkedIn: false,
      streak: { current: 0, longest: 0, lastDoneDate: null },
    });
  });

  it("HAB-I-05 GET /habits/:id milik sendiri -> 200 dengan ringkasan streak", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "Mine", type: "POSITIVE" },
    });
    const response = await request(app)
      .get(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect((response.body as HabitBody).habit).toMatchObject({
      id: habit.id,
      ownerId: user.id,
      streak: { current: 0, longest: 0, lastDoneDate: null },
    });
  });

  it("HAB-I-06 GET /habits/:id milik user lain -> 404 envelope", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: owner.user.id, title: "Private", type: "POSITIVE" },
    });
    const response = await request(app)
      .get(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${outsider.token}`);
    expect(response.status).toBe(404);
    expect(errorBody(response.body).error.code).toBe("NOT_FOUND");
  });

  it("HAB-I-07 PATCH /habits/:id milik sendiri -> 200 dengan title dan description baru", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "Old title", type: "POSITIVE", description: "Old" },
    });
    const response = await request(app)
      .patch(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "New title", description: "New description" });
    expect(response.status).toBe(200);
    expect((response.body as HabitBody).habit).toMatchObject({
      title: "New title",
      description: "New description",
    });
  });

  it("HAB-I-08 PATCH /habits/:id milik user lain -> 404 envelope", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: owner.user.id, title: "Private", type: "POSITIVE" },
    });
    const response = await request(app)
      .patch(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ title: "Changed" });
    expect(response.status).toBe(404);
    expect(errorBody(response.body).error.code).toBe("NOT_FOUND");
  });

  it("HAB-I-09 DELETE /habits/:id -> 204 dan check-in terhapus cascade", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "To delete", type: "POSITIVE" },
    });
    await prisma.checkIn.create({
      data: { habitId: habit.id, date: new Date("2026-09-28T00:00:00.000Z") },
    });

    const response = await request(app)
      .delete(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goalReplacements: [] });
    expect(response.status).toBe(204);
    expect(await prisma.habit.findUnique({ where: { id: habit.id } })).toBeNull();
    expect(await prisma.checkIn.count({ where: { habitId: habit.id } })).toBe(0);
  });

  it("HAB-I-11 DELETE wajib meminta pengganti untuk goal yang akan kosong", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "Only habit", type: "POSITIVE" },
    });
    const goal = await prisma.goal.create({ data: { ownerId: user.id, title: "Goal" } });
    await prisma.goalHabit.create({ data: { goalId: goal.id, habitId: habit.id } });

    const response = await request(app)
      .delete(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goalReplacements: [] });

    expect(response.status).toBe(422);
    expect(errorBody(response.body).error.code).toBe("REPLACEMENT_REQUIRED");
    expect(await prisma.habit.findUnique({ where: { id: habit.id } })).not.toBeNull();
    expect(await prisma.goalHabit.findMany({ where: { goalId: goal.id } })).toHaveLength(1);
  });

  it("HAB-I-12 DELETE assigns replacement and deletes habit atomically for multiple goals", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "Only habit", type: "POSITIVE" },
    });
    const replacement = await prisma.habit.create({
      data: { ownerId: user.id, title: "Replacement", type: "NEGATIVE" },
    });
    const goals = await Promise.all([
      prisma.goal.create({ data: { ownerId: user.id, title: "Goal one" } }),
      prisma.goal.create({ data: { ownerId: user.id, title: "Goal two" } }),
    ]);
    await prisma.goalHabit.createMany({
      data: goals.map((goal) => ({ goalId: goal.id, habitId: habit.id })),
    });

    const response = await request(app)
      .delete(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        goalReplacements: goals.map((goal) => ({ goalId: goal.id, habitId: replacement.id })),
      });

    expect(response.status).toBe(204);
    expect(await prisma.habit.findUnique({ where: { id: habit.id } })).toBeNull();
    for (const goal of goals) {
      expect(
        await prisma.goalHabit.findUnique({
          where: { goalId_habitId: { goalId: goal.id, habitId: replacement.id } },
        }),
      ).not.toBeNull();
    }
  });

  it("HAB-I-13 DELETE rejects a replacement owned by another user", async () => {
    const owner = await createUser();
    const other = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: owner.user.id, title: "Only habit", type: "POSITIVE" },
    });
    const replacement = await prisma.habit.create({
      data: { ownerId: other.user.id, title: "Private replacement", type: "POSITIVE" },
    });
    const goal = await prisma.goal.create({ data: { ownerId: owner.user.id, title: "Goal" } });
    await prisma.goalHabit.create({ data: { goalId: goal.id, habitId: habit.id } });

    const response = await request(app)
      .delete(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ goalReplacements: [{ goalId: goal.id, habitId: replacement.id }] });

    expect(response.status).toBe(404);
    expect(await prisma.habit.findUnique({ where: { id: habit.id } })).not.toBeNull();
    expect(await prisma.goalHabit.findMany({ where: { goalId: goal.id } })).toHaveLength(1);
  });

  it("HAB-I-14 DELETE creates and assigns one inline replacement to multiple goals atomically", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "Only habit", type: "POSITIVE" },
    });
    const goals = await Promise.all([
      prisma.goal.create({ data: { ownerId: user.id, title: "Goal one" } }),
      prisma.goal.create({ data: { ownerId: user.id, title: "Goal two" } }),
    ]);
    await prisma.goalHabit.createMany({
      data: goals.map((goal) => ({ goalId: goal.id, habitId: habit.id })),
    });

    const response = await request(app)
      .delete(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        goalReplacements: [],
        newHabitGoalIds: goals.map((goal) => goal.id),
        newHabit: { title: "New replacement", type: "NEGATIVE" },
      });

    expect(response.status).toBe(204);
    expect(await prisma.habit.findUnique({ where: { id: habit.id } })).toBeNull();
    const replacement = await prisma.habit.findFirst({
      where: { ownerId: user.id, title: "New replacement" },
    });
    expect(replacement).not.toBeNull();
    for (const goal of goals) {
      expect(
        await prisma.goalHabit.findUnique({
          where: { goalId_habitId: { goalId: goal.id, habitId: replacement?.id ?? "" } },
        }),
      ).not.toBeNull();
    }
  });

  it("HAB-I-15 DELETE rejects duplicate or unrelated replacements without partial mutation", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "Only linked habit", type: "POSITIVE" },
    });
    const replacement = await prisma.habit.create({
      data: { ownerId: user.id, title: "Replacement", type: "POSITIVE" },
    });
    const goal = await prisma.goal.create({ data: { ownerId: user.id, title: "Affected goal" } });
    const unrelatedGoal = await prisma.goal.create({
      data: { ownerId: user.id, title: "Unrelated goal" },
    });
    await prisma.goalHabit.create({ data: { goalId: goal.id, habitId: habit.id } });
    await prisma.goalHabit.create({ data: { goalId: unrelatedGoal.id, habitId: replacement.id } });

    const duplicate = await request(app)
      .delete(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        goalReplacements: [
          { goalId: goal.id, habitId: replacement.id },
          { goalId: goal.id, habitId: replacement.id },
        ],
      });
    expect(duplicate.status).toBe(400);
    expect(errorBody(duplicate.body).error.code).toBe("VALIDATION_ERROR");

    const unrelated = await request(app)
      .delete(`/api/v1/habits/${habit.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ goalReplacements: [{ goalId: unrelatedGoal.id, habitId: replacement.id }] });
    expect(unrelated.status).toBe(422);
    expect(errorBody(unrelated.body).error.code).toBe("REPLACEMENT_REQUIRED");
    expect(await prisma.habit.findUnique({ where: { id: habit.id } })).not.toBeNull();
    expect(
      await prisma.goalHabit.findUnique({
        where: { goalId_habitId: { goalId: goal.id, habitId: habit.id } },
      }),
    ).not.toBeNull();
    expect(await prisma.goalHabit.count({ where: { goalId: unrelatedGoal.id } })).toBe(1);
  });

  it("HAB-I-10 malformed UUID ditolak 400 dan tanggal historis mengembalikan checkIn netral", async () => {
    const { user, token } = await createUser();
    const habit = await prisma.habit.create({
      data: { ownerId: user.id, title: "History", type: "POSITIVE" },
    });
    const selectedDate = new Date(`${todayWIB()}T00:00:00.000Z`);
    selectedDate.setUTCDate(selectedDate.getUTCDate() - 1);
    const dateKey = selectedDate.toISOString().slice(0, 10);
    await prisma.checkIn.create({
      data: { habitId: habit.id, date: dateOnlyToUTC(dateKey), status: "DONE" },
    });

    const invalidId = await request(app)
      .get("/api/v1/habits/not-a-uuid")
      .set("Authorization", `Bearer ${token}`);
    expect(invalidId.status).toBe(400);
    expect(errorBody(invalidId.body).error.code).toBe("VALIDATION_ERROR");

    const response = await request(app)
      .get("/api/v1/habits")
      .query({ date: dateKey })
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.habits[0]).toMatchObject({
      id: habit.id,
      checkIn: { status: "DONE" },
      checkedIn: true,
      streak: { current: 1, longest: 1, lastDoneDate: dateKey },
    });
    expect(response.body.habits[0]).not.toHaveProperty("todayCheckIn");
  });
});
