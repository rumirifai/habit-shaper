import { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleApiError } from "../api-error.js";

afterEach(() => vi.restoreAllMocks());

function responseMock() {
  const response = {
    locals: {},
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  return response as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function prismaError(code: "P2002" | "P2003" | "P2025"): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("test prisma error", {
    code,
    clientVersion: "test",
  });
}

describe("Prisma API error mapping", () => {
  it("EDGE-10 maps P2025 to 404 NOT_FOUND", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = responseMock();
    handleApiError({ method: "GET", path: "/resource" } as Request, response, prismaError("P2025"));
    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: "NOT_FOUND", message: "Data tidak ditemukan." },
    });
  });

  it("EDGE-10 maps P2003 to 422 UNPROCESSABLE_ENTITY", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = responseMock();
    handleApiError(
      { method: "POST", path: "/resource" } as Request,
      response,
      prismaError("P2003"),
    );
    expect(response.status).toHaveBeenCalledWith(422);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: "UNPROCESSABLE_ENTITY", message: "Relasi data tidak valid." },
    });
  });

  it("EDGE-10 generic P2002 maps to 409 (check-in handles its idempotent case at the operation boundary)", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = responseMock();
    handleApiError(
      { method: "POST", path: "/resource" } as Request,
      response,
      prismaError("P2002"),
    );
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: "CONFLICT", message: "Data bertentangan dengan data yang sudah ada." },
    });
  });
});
