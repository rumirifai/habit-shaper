import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { REFRESH_COOKIE_NAME } from "../src/lib/jwt.js";

type RegisteredUser = { id: string; email: string; name: string | null };
type ErrorBody = { error: { code: string; message: string; details?: unknown } };
type TokenBody = { accessToken: string };

const users: string[] = [];
let unique = 0;

async function register(name = "Test User"): Promise<RegisteredUser> {
  unique += 1;
  const response = await request(app).post("/api/v1/auth/register").send({
    email: `auth-${Date.now()}-${unique}@example.com`, password: "correct-horse-123", name,
  });
  expect(response.status).toBe(201);
  const user = response.body.user as RegisteredUser;
  users.push(user.id);
  return user;
}

async function login(email: string, password = "correct-horse-123") {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

function errorBody(body: unknown): ErrorBody {
  expect(body).toHaveProperty("error.code");
  expect(body).toHaveProperty("error.message");
  return body as ErrorBody;
}

function refreshCookieHeader(headers: unknown): string | undefined {
  const values: readonly unknown[] = Array.isArray(headers) ? headers : [headers];
  return values.find(
    (value): value is string =>
      typeof value === "string" && value.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );
}

afterEach(async () => {
  if (users.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: users.splice(0) } } });
  }
});

describe("Auth integration", () => {
  it("AUTH-I-01 POST /register -> 201 tanpa membocorkan passwordHash", async () => {
    const user = await register();
    expect(user).toEqual(expect.objectContaining({ id: expect.any(String), email: expect.any(String), name: "Test User" }));
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("AUTH-I-02 POST /register duplikat -> 409 dengan error envelope", async () => {
    const user = await register();
    const response = await request(app).post("/api/v1/auth/register").send({ email: user.email, password: "correct-horse-123" });
    expect(response.status).toBe(409);
    expect(errorBody(response.body).error.code).toBe("CONFLICT");
  });

  it("AUTH-I-03 POST /register invalid -> 400 VALIDATION_ERROR dengan details", async () => {
    const response = await request(app).post("/api/v1/auth/register").send({ email: "bukan-email", password: "short" });
    expect(response.status).toBe(400);
    const body = errorBody(response.body);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
  });

  it("AUTH-I-04 POST /login valid -> 200 access token dan cookie HttpOnly", async () => {
    const user = await register();
    const response = await login(user.email);
    expect(response.status).toBe(200);
    expect((response.body as TokenBody).accessToken).toEqual(expect.any(String));
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining(`${REFRESH_COOKIE_NAME}=`), expect.stringContaining("HttpOnly")]));
  });

  it("AUTH-I-05 POST /login password salah -> 401 tanpa cookie", async () => {
    const user = await register();
    const response = await login(user.email, "wrong-password");
    expect(response.status).toBe(401);
    expect(errorBody(response.body).error.code).toBe("INVALID_CREDENTIALS");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("AUTH-I-06 POST /refresh cookie valid -> 200 access token baru", async () => {
    const user = await register();
    const loggedIn = await login(user.email);
    const cookie = refreshCookieHeader(loggedIn.headers["set-cookie"])?.split(";")[0];
    const response = await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie ?? "");
    expect(response.status).toBe(200);
    expect((response.body as TokenBody).accessToken).toEqual(expect.any(String));
  });

  it.each([undefined, `${REFRESH_COOKIE_NAME}=invalid`])("AUTH-I-07 POST /refresh cookie hilang/rusak -> 401", async (cookie) => {
    const req = request(app).post("/api/v1/auth/refresh");
    if (cookie !== undefined) req.set("Cookie", cookie);
    const response = await req;
    expect(response.status).toBe(401);
    errorBody(response.body);
  });

  it("AUTH-I-08 POST /logout -> 204 dan cookie di-clear", async () => {
    const user = await register();
    const loggedIn = await login(user.email);
    const cookie = refreshCookieHeader(loggedIn.headers["set-cookie"])?.split(";")[0];
    const response = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie ?? "");
    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]).toEqual(expect.arrayContaining([expect.stringContaining(`${REFRESH_COOKIE_NAME}=`)]));
  });

  it("AUTH-I-09 GET /habits tanpa token -> 401 error envelope", async () => {
    const response = await request(app).get("/api/v1/habits");
    expect(response.status).toBe(401);
    expect(errorBody(response.body).error.code).toBe("UNAUTHORIZED");
  });

  it("AUTH-I-10 GET habits hanya milik user; milik user lain -> 404", async () => {
    const owner = await register();
    const outsider = await register();
    const habit = await prisma.habit.create({ data: { ownerId: owner.id, title: "Owner habit", type: "POSITIVE" } });
    const token = (await login(outsider.email)).body.accessToken as string;
    const list = await request(app).get("/api/v1/habits").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.habits).toEqual([]);
    const detail = await request(app).get(`/api/v1/habits/${habit.id}`).set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(404);
    expect(errorBody(detail.body).error.code).toBe("NOT_FOUND");
  });

  it("AUTH-I-11 Prisma menyimpan password sebagai hash", async () => {
    const user = await register();
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).not.toBe("correct-horse-123");
    const loginResponse = await login(user.email);
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body).toHaveProperty("accessToken");
  });

  it("AUTH-I-12 requireAuth menyediakan string user id dan habit query memfilter ownerId", async () => {
    const user = await register();
    const habit = await prisma.habit.create({ data: { ownerId: user.id, title: "Mine", type: "POSITIVE" } });
    const token = (await login(user.email)).body.accessToken as string;
    const response = await request(app).get(`/api/v1/habits/${habit.id}`).set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.habit.ownerId).toBe(user.id);
    expect(typeof response.body.habit.ownerId).toBe("string");
  });
});
