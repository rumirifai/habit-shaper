import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import Home from "../app/page";
import { jsonResponse, renderWithRouter, router, sessionResponse } from "./test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => router }));

it("loads weekly data on disclosure and reuses it when reopened", async () => {
  const weekly = { habitId: "h1", weekStart: "2026-09-28", weekEnd: "2026-10-04", done: 4, miss: 3, allowance: 3, remaining: 0, days: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date) => ({ date, status: "DONE" })) };
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("auth/refresh")) return sessionResponse();
    if (url === "/api/v1/habits") return jsonResponse({ habits: [{ id: "h1", title: "Berjalan", type: "POSITIVE", checkedIn: false }] });
    if (url.includes("range=daily")) return jsonResponse({ habitId: "h1", current: 2, longest: 3, lastDoneDate: "2026-10-03" });
    if (url.includes("range=weekly")) return jsonResponse(weekly);
    return jsonResponse({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  const user = userEvent.setup();
  renderWithRouter(<Home />);
  await screen.findByText("Berjalan");
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("range=weekly"))).toBe(false);
  const disclosure = screen.getByRole("button", { name: "Tampilkan streak dan kalender mingguan: Berjalan" });
  await user.click(disclosure);
  expect(await screen.findByText("Done 4/7 · Miss 3 · Sisa toleransi 0")).toBeInTheDocument();
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("range=weekly"))).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Sembunyikan streak dan kalender mingguan: Berjalan" }));
  await user.click(screen.getByRole("button", { name: "Tampilkan streak dan kalender mingguan: Berjalan" }));
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("range=weekly"))).toHaveLength(1);
});
