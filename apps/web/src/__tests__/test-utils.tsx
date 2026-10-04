import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { vi } from "vitest";

export const router = { push: vi.fn(), replace: vi.fn() };

export function renderWithRouter(ui: ReactElement) {
  return render(ui);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function sessionResponse(): Response {
  return jsonResponse({
    accessToken: "test-token",
    user: { id: "user-1", email: "user@example.com", name: "User" },
  });
}
