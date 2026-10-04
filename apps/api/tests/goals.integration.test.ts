import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { dateOnlyToUTC, todayWIB } from "../src/utils/date.js";

type RegisteredUser = { id: string; email: string };
type ErrorBody = { error: { code: string; message: string; details?: unknown } };
type LoginBody = { accessToken: string };
type GoalResponse = {
  goal: {
    id: string;
    title: string;
    description: string | null;
    deadline: string | null;
    habitLinks: Array<{ habit: { id: string; title: string; type: "POSITIVE" | "NEGATIVE" } }>;
    habitCount?: number;
    progress?: {
      weeklyCompletionPct: number;
      perHabit: Array<{ habitId: string; done: number; miss: number }>;
    };
  };
  habitCount?: number;
  progress?: {
    weeklyCompletionPct: number;
    perHabit: Array<{ habitId: string; done: number; miss: number }>;
  };
};

const createdUserIds: string[] = [];
let sequence = 0;

async function createUser(): Promise<{ user: RegisteredUser; token: string }> {
  sequence += 1;
  const email = `goal-${Date.now()}-${sequence}@example.com`;
  const registered = await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: "correct-horse-123", name: "Goal Test" });
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

async function createHabit(ownerId: string, title = "Goal habit"): Promise<string> {
  const habit = await prisma.habit.create({ data: { ownerId, title, type: "POSITIVE" } });
  return habit.id;
}

async function createGoal(
  token: string,
  habitIds: string[],
  title = "Test goal",
): Promise<GoalResponse["goal"]> {
  const response = await request(app)
    .post("/api/v1/goals")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, habitIds });
  expect(response.status).toBe(201);
  return (response.body as GoalResponse).goal;
}

afterEach(async () => {
  if (createdUserIds.length > 0)
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds.splice(0) } } });
});

describe("Goals integration", () => {
  it("GOAL-I-01 POST /goals dengan habitIds milik sendiri -> 201 dan join terbentuk", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const goal = await createGoal(token, [habitId]);
    expect(
      await prisma.goalHabit.findUnique({
        where: { goalId_habitId: { goalId: goal.id, habitId } },
      }),
    ).not.toBeNull();
  });

  it("GOAL-I-02 POST /goals tanpa habitIds/newHabits -> menolak dengan pesan minimal 1 habit", async () => {
    const { token } = await createUser();
    const response = await request(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Empty goal" });
    expect(response.status).toBe(422);
    expect(errorBody(response.body).error.code).toBe("UNPROCESSABLE_ENTITY");
    expect(errorBody(response.body).error.message).toMatch(/minimal 1 habit/i);
  });

  it("GOAL-I-15 POST /goals dengan habitIds duplikat -> 400 VALIDATION_ERROR", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const response = await request(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Duplicate IDs",
        habitIds: [habitId, habitId],
      });
    expect(response.status).toBe(400);
    expect(errorBody(response.body).error.code).toBe("VALIDATION_ERROR");
  });

  it("GOAL-I-03 POST /goals dengan newHabits inline -> goal, habit, dan join dibuat", async () => {
    const { user, token } = await createUser();
    const response = await request(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Inline goal",
        newHabits: [{ title: "Inline habit", type: "NEGATIVE" }],
      });
    expect(response.status).toBe(201);
    const goal = (response.body as GoalResponse).goal;
    const habit = await prisma.habit.findFirstOrThrow({
      where: { ownerId: user.id, title: "Inline habit" },
    });
    expect(
      await prisma.goalHabit.findUnique({
        where: { goalId_habitId: { goalId: goal.id, habitId: habit.id } },
      }),
    ).not.toBeNull();
  });

  it("GOAL-I-04 POST /goals campuran habitIds dan newHabits -> 201 dengan semua relasi", async () => {
    const { user, token } = await createUser();
    const existingId = await createHabit(user.id, "Existing");
    const response = await request(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Mixed goal",
        habitIds: [existingId],
        newHabits: [{ title: "New inline", type: "POSITIVE" }],
      });
    expect(response.status).toBe(201);
    const goal = (response.body as GoalResponse).goal;
    expect(await prisma.goalHabit.count({ where: { goalId: goal.id } })).toBe(2);
  });

  it("GOAL-I-05 POST /goals dengan habit user lain -> 404 dan tidak membuat goal parsial", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const foreignHabitId = await createHabit(owner.user.id);
    const before = await prisma.goal.count({ where: { ownerId: outsider.user.id } });
    const response = await request(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ title: "Invalid", habitIds: [foreignHabitId] });
    expect([404, 422]).toContain(response.status);
    errorBody(response.body);
    expect(await prisma.goal.count({ where: { ownerId: outsider.user.id } })).toBe(before);
  });

  it("GOAL-I-06 GET /goals -> memuat habitCount dan progres", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    await createGoal(token, [habitId]);
    const response = await request(app)
      .get("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.goals[0]).toMatchObject({
      habitCount: 1,
      progress: {
        weeklyCompletionPct: expect.any(Number),
        perHabit: [{ habitId, done: expect.any(Number), miss: expect.any(Number) }],
      },
    });
  });

  it("GOAL-I-17 progress starts inclusively on the habit's creation date in WIB", async () => {
    const { user, token } = await createUser();
    const today = todayWIB();
    const habit = await prisma.habit.create({
      data: {
        ownerId: user.id,
        title: "Habit created today",
        type: "POSITIVE",
        createdAt: dateOnlyToUTC(today),
      },
    });
    const goal = await prisma.goal.create({ data: { ownerId: user.id, title: "New habit goal" } });
    await prisma.goalHabit.create({ data: { goalId: goal.id, habitId: habit.id } });
    await prisma.checkIn.create({
      data: { habitId: habit.id, date: dateOnlyToUTC(today), status: "DONE" },
    });

    const response = await request(app)
      .get("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.goals[0]).toMatchObject({
      id: goal.id,
      progress: {
        weeklyCompletionPct: 100,
        perHabit: [{ habitId: habit.id, done: 1, miss: 0 }],
      },
    });
  });

  it("GOAL-I-07 GET /goals/:id -> memuat habits dan metrik progres", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const goal = await createGoal(token, [habitId]);
    const response = await request(app)
      .get(`/api/v1/goals/${goal.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    const body = response.body as GoalResponse;
    expect(body.habitCount).toBe(1);
    expect(body.goal.habitLinks.map(({ habit }) => habit.id)).toContain(habitId);
    expect(body.progress?.weeklyCompletionPct ?? body.goal.progress?.weeklyCompletionPct).toEqual(
      expect.any(Number),
    );
    expect(body.progress?.perHabit ?? body.goal.progress?.perHabit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ habitId, done: expect.any(Number), miss: expect.any(Number) }),
      ]),
    );
  });

  it("GOAL-I-08 PATCH /goals/:id mengubah field goal tanpa mengubah streak/check-in", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const goal = await createGoal(token, [habitId]);
    await prisma.checkIn.create({ data: { habitId, date: new Date("2026-09-28T00:00:00.000Z") } });
    const response = await request(app)
      .patch(`/api/v1/goals/${goal.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated", description: "Changed", deadline: "2026-12-31" });
    expect(response.status).toBe(200);
    expect((response.body as GoalResponse).goal).toMatchObject({
      title: "Updated",
      description: "Changed",
      deadline: expect.any(String),
    });
    expect(await prisma.checkIn.count({ where: { habitId } })).toBe(1);
  });

  it("PATCH /goals/:id menyimpan perubahan goal dan relasi habit sebagai satu transaksi", async () => {
    const { user, token } = await createUser();
    const first = await createHabit(user.id, "First");
    const second = await createHabit(user.id, "Second");
    const added = await createHabit(user.id, "Added");
    const inlineHabitTitle = "Created inside transaction";
    const goal = await createGoal(token, [first, second]);

    const combined = await request(app)
      .patch(`/api/v1/goals/${goal.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "Atomic update",
        addHabitIds: [added],
        removeHabitIds: [first],
        newHabits: [{ title: inlineHabitTitle, type: "NEGATIVE" }],
      });
    expect(combined.status).toBe(200);
    expect(combined.body.goal.title).toBe("Atomic update");
    const inlineHabitId = combined.body.createdHabitIds[0] as string;
    expect(
      combined.body.goal.habitLinks.map(({ habit }: { habit: { id: string } }) => habit.id).sort(),
    ).toEqual([second, added, inlineHabitId].sort());
    expect(combined.body.goal.habitLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          habit: expect.objectContaining({
            id: inlineHabitId,
            title: inlineHabitTitle,
            type: "NEGATIVE",
          }),
        }),
      ]),
    );

    const rejected = await request(app)
      .patch(`/api/v1/goals/${goal.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Should roll back", removeHabitIds: [second, added, inlineHabitId] });
    expect(rejected.status).toBe(422);
    const unchanged = await prisma.goal.findUnique({
      where: { id: goal.id },
      include: { habitLinks: { select: { habitId: true } } },
    });
    expect(unchanged?.title).toBe("Atomic update");
    expect(unchanged?.habitLinks.map(({ habitId }) => habitId).sort()).toEqual(
      [second, added, inlineHabitId].sort(),
    );
  });

  it("PATCH /goals/:id rolls back inline habit creation when assigning its relation fails", async () => {
    const { user, token } = await createUser();
    const initialHabitId = await createHabit(user.id, "Existing before failed inline save");
    const goal = await createGoal(token, [initialHabitId]);
    const inlineTitle = `Rollback inline ${goal.id}`;

    try {
      await prisma.$executeRaw`
        CREATE OR REPLACE FUNCTION public.fail_ui21_goal_habit_insert()
        RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'UI-21 integration test assignment failure' USING ERRCODE = 'P0001';
        END;
        $$ LANGUAGE plpgsql;
      `;
      await prisma.$executeRaw`
        CREATE TRIGGER fail_ui21_goal_habit_insert
        BEFORE INSERT ON "GoalHabit"
        FOR EACH ROW EXECUTE FUNCTION public.fail_ui21_goal_habit_insert();
      `;

      const response = await request(app)
        .patch(`/api/v1/goals/${goal.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          removeHabitIds: [initialHabitId],
          newHabits: [{ title: inlineTitle, type: "NEGATIVE" }],
        });

      expect(response.status).toBe(500);
      errorBody(response.body);
      expect(await prisma.habit.count({ where: { ownerId: user.id, title: inlineTitle } })).toBe(0);
      expect(
        await prisma.goalHabit.findUnique({
          where: { goalId_habitId: { goalId: goal.id, habitId: initialHabitId } },
        }),
      ).not.toBeNull();
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS fail_ui21_goal_habit_insert ON "GoalHabit"`;
      await prisma.$executeRaw`DROP FUNCTION IF EXISTS public.fail_ui21_goal_habit_insert()`;
    }
  });

  it("GOAL-I-09 DELETE /goals/:id -> 204, habit dan check-in tetap utuh", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const goal = await createGoal(token, [habitId]);
    await prisma.checkIn.create({ data: { habitId, date: new Date("2026-09-28T00:00:00.000Z") } });
    const streakBefore = await request(app)
      .get(`/api/v1/habits/${habitId}/streak?range=daily`)
      .set("Authorization", `Bearer ${token}`);
    expect(streakBefore.status).toBe(200);
    const response = await request(app)
      .delete(`/api/v1/goals/${goal.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(204);
    expect(await prisma.habit.findUnique({ where: { id: habitId } })).not.toBeNull();
    expect(await prisma.checkIn.count({ where: { habitId } })).toBe(1);
    expect(await prisma.goalHabit.count({ where: { goalId: goal.id } })).toBe(0);
    const streakAfter = await request(app)
      .get(`/api/v1/habits/${habitId}/streak?range=daily`)
      .set("Authorization", `Bearer ${token}`);
    expect(streakAfter.status).toBe(200);
    expect(streakAfter.body).toEqual(streakBefore.body);
  });

  it("GOAL-I-10 POST /goals/:id/habits -> assign idempotent tanpa duplikat", async () => {
    const { user, token } = await createUser();
    const initialHabit = await createHabit(user.id, "Initial");
    const goal = await createGoal(token, [initialHabit]);
    const habitId = await createHabit(user.id, "Assigned");
    const endpoint = `/api/v1/goals/${goal.id}/habits`;
    expect(
      (await request(app).post(endpoint).set("Authorization", `Bearer ${token}`).send({ habitId }))
        .status,
    ).toBe(200);
    expect(
      (await request(app).post(endpoint).set("Authorization", `Bearer ${token}`).send({ habitId }))
        .status,
    ).toBe(200);
    expect(await prisma.goalHabit.count({ where: { goalId: goal.id, habitId } })).toBe(1);
  });

  it("GOAL-I-11 POST /goals/:id/habits dengan habit user lain -> 404", async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const ownHabit = await createHabit(outsider.user.id);
    const goal = await createGoal(outsider.token, [ownHabit]);
    const foreignHabit = await createHabit(owner.user.id);
    const response = await request(app)
      .post(`/api/v1/goals/${goal.id}/habits`)
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ habitId: foreignHabit });
    expect(response.status).toBe(404);
    expect(errorBody(response.body).error.code).toBe("NOT_FOUND");
  });

  it("GOAL-I-16 POST habit lalu assign ke goal -> muncul pada daftar habit dan relasi goal", async () => {
    const { user, token } = await createUser();
    const initialHabitId = await createHabit(user.id, "Existing habit");
    const goal = await createGoal(token, [initialHabitId]);
    const created = await request(app)
      .post("/api/v1/habits")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Inline replacement", type: "NEGATIVE" });
    expect(created.status).toBe(201);
    const createdHabit = created.body.habit as {
      id: string;
      title: string;
      type: "POSITIVE" | "NEGATIVE";
    };

    const assigned = await request(app)
      .post(`/api/v1/goals/${goal.id}/habits`)
      .set("Authorization", `Bearer ${token}`)
      .send({ habitId: createdHabit.id });
    expect(assigned.status).toBe(200);

    const [habitsResponse, goalsResponse] = await Promise.all([
      request(app).get("/api/v1/habits").set("Authorization", `Bearer ${token}`),
      request(app).get("/api/v1/goals").set("Authorization", `Bearer ${token}`),
    ]);
    expect(habitsResponse.status).toBe(200);
    expect(habitsResponse.body.habits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createdHabit.id,
          title: "Inline replacement",
          type: "NEGATIVE",
        }),
      ]),
    );
    expect(goalsResponse.status).toBe(200);
    expect(goalsResponse.body.goals[0].habitLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          habit: expect.objectContaining({ id: createdHabit.id, title: "Inline replacement" }),
        }),
      ]),
    );
  });

  it("GOAL-I-12 DELETE /goals/:id/habits/:habitId -> unassign satu dari banyak", async () => {
    const { user, token } = await createUser();
    const first = await createHabit(user.id, "First");
    const second = await createHabit(user.id, "Second");
    const goal = await createGoal(token, [first, second]);
    const response = await request(app)
      .delete(`/api/v1/goals/${goal.id}/habits/${first}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(204);
    expect(
      await prisma.goalHabit.findUnique({
        where: { goalId_habitId: { goalId: goal.id, habitId: first } },
      }),
    ).toBeNull();
    expect(
      await prisma.goalHabit.findUnique({
        where: { goalId_habitId: { goalId: goal.id, habitId: second } },
      }),
    ).not.toBeNull();
  });

  it("GOAL-I-13 DELETE habit terakhir -> 422 dan relasi dipertahankan", async () => {
    const { user, token } = await createUser();
    const habitId = await createHabit(user.id);
    const goal = await createGoal(token, [habitId]);
    const response = await request(app)
      .delete(`/api/v1/goals/${goal.id}/habits/${habitId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(422);
    expect(errorBody(response.body).error.message).toMatch(/minimal 1 habit/i);
    expect(await prisma.goalHabit.count({ where: { goalId: goal.id } })).toBe(1);
  });

  it("GOAL-I-14 error goal -> envelope baku untuk 400, 401, 404, dan 422", async () => {
    const { token } = await createUser();
    const invalid = await request(app)
      .post("/api/v1/goals")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "" });
    expect(invalid.status).toBe(400);
    errorBody(invalid.body);
    const unauthenticated = await request(app).get("/api/v1/goals");
    expect(unauthenticated.status).toBe(401);
    errorBody(unauthenticated.body);
    const missing = await request(app)
      .get("/api/v1/goals/00000000-0000-4000-8000-000000000000")
      .set("Authorization", `Bearer ${token}`);
    expect(missing.status).toBe(404);
    errorBody(missing.body);
    const { user, token: otherToken } = await createUser();
    const habitId = await createHabit(user.id);
    const goal = await createGoal(otherToken, [habitId]);
    const lastHabitError = await request(app)
      .delete(`/api/v1/goals/${goal.id}/habits/${habitId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(lastHabitError.status).toBe(422);
    errorBody(lastHabitError.body);
  });
});
