import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GoalsPanel from "../app/goals-panel";
import { jsonResponse, renderWithRouter, router, sessionResponse } from "./test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const habit = { id: "habit-1", title: "Membaca", type: "POSITIVE" as const };
const goal = {
  id: "goal-1", title: "Belajar rutin", description: null, deadline: null, habitCount: 1,
  habitLinks: [{ habit }], progress: { weeklyCompletionPct: 60, perHabit: [{ habitId: habit.id, done: 3, miss: 2 }] },
};
const extraHabit = { id: "habit-2", title: "Olahraga", type: "NEGATIVE" as const };

function setupFetch(options: { goals?: unknown; habits?: unknown } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(init === undefined ? { url } : { url, init });
    if (url.includes("auth/refresh")) return sessionResponse();
    if (url === "/api/v1/goals" && init?.method === "POST") return jsonResponse({ goal: { ...goal, title: "Target baru" } }, 201);
    if (url === "/api/v1/goals") return jsonResponse(options.goals ?? { goals: [] });
    if (url === "/api/v1/habits") return jsonResponse(options.habits ?? { habits: [habit, extraHabit] });
    if (url.startsWith("/api/v1/goals/") && init?.method === "PATCH") return jsonResponse({ goal, createdHabitIds: [] });
    if (url.startsWith("/api/v1/goals/") && init?.method === "DELETE") return new Response(null, { status: 204 });
    return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Goal minimal 1 habit." } }, 422);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

describe("goals panel", () => {
  beforeEach(() => router.replace.mockReset());

  it("UI-09 rejects a goal without a habit before making a request", async () => {
    const { calls } = setupFetch({ habits: { habits: [] } });
    const user = userEvent.setup();
    renderWithRouter(<GoalsPanel />);
    await user.click(await screen.findByRole("button", { name: "Buat goal" }));
    await user.type(screen.getByRole("textbox", { name: "Nama goal" }), "Baca buku");
    await user.click(screen.getByRole("button", { name: "Simpan goal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("minimal satu habit");
    expect(calls.some(({ url, init }) => url === "/api/v1/goals" && init?.method === "POST")).toBe(false);
  });

  it("UI-10 selects an existing habit and creates an inline habit in one submission", async () => {
    const { calls } = setupFetch();
    const user = userEvent.setup();
    renderWithRouter(<GoalsPanel />);
    await user.click(await screen.findByRole("button", { name: "Buat goal" }));
    await user.type(screen.getByRole("textbox", { name: "Nama goal" }), "Baca rutin");
    await user.click(screen.getByRole("combobox", { name: "Pilih habit atau buat yang baru" }));
    await user.click(await screen.findByRole("option", { name: /Membaca/ }));
    await user.click(screen.getByRole("combobox", { name: "Tambah habit" }));
    await user.click(await screen.findByRole("option", { name: /Buat habit baru/ }));
    await user.type(screen.getByRole("textbox", { name: "Nama habit" }), "Lari pagi");
    await user.click(screen.getByRole("button", { name: "Simpan goal" }));
    await waitFor(() => expect(calls.some(({ url, init }) => url === "/api/v1/goals" && init?.method === "POST")).toBe(true));
    const request = calls.find(({ url, init }) => url === "/api/v1/goals" && init?.method === "POST");
    expect(JSON.parse(String(request?.init?.body))).toMatchObject({ habitIds: ["habit-1"], newHabits: [{ title: "Lari pagi", type: "POSITIVE" }] });
  });

  it("UI-11 displays percentage and per-habit progress", async () => {
    setupFetch({ goals: { goals: [goal] } });
    renderWithRouter(<GoalsPanel />);
    expect(await screen.findByRole("progressbar", { name: "Progres minggu ini: 60%" })).toHaveAttribute("value", "60");
    expect(screen.getByText("Membaca: 3 selesai, 2 terlewat")).toBeInTheDocument();
  });

  it("UI-12 confirms goal removal with copy that protects habit streaks", async () => {
    setupFetch({ goals: { goals: [goal] } });
    const user = userEvent.setup();
    renderWithRouter(<GoalsPanel />);
    await user.click(await screen.findByRole("button", { name: "Hapus goal: Belajar rutin" }));
    expect(screen.getByRole("dialog", { name: "Hapus goal?" })).toHaveTextContent("streak, dan check-in tetap utuh");
  });

  it("UI-13 presents goal API validation errors to the user", async () => {
    const { fetchMock } = setupFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("auth/refresh")) return sessionResponse();
      if (url === "/api/v1/goals" && init?.method === "POST") return jsonResponse({ error: { code: "BUSINESS_RULE", message: "Goal wajib punya minimal 1 habit." } }, 422);
      if (url === "/api/v1/goals") return jsonResponse({ goals: [] });
      if (url === "/api/v1/habits") return jsonResponse({ habits: [habit] });
      return jsonResponse({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
    });
    const user = userEvent.setup();
    renderWithRouter(<GoalsPanel />);
    await user.click(await screen.findByRole("button", { name: "Buat goal" }));
    await user.type(screen.getByRole("textbox", { name: "Nama goal" }), "Target");
    await user.click(screen.getByRole("combobox", { name: "Pilih habit atau buat yang baru" }));
    await user.click(await screen.findByRole("option", { name: /Membaca/ }));
    await user.click(screen.getByRole("button", { name: "Simpan goal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Goal wajib punya minimal 1 habit.");
  });

  it("UI-19 assigns an existing habit atomically from the goal editor", async () => {
    const { calls } = setupFetch({ goals: { goals: [goal] } });
    const user = userEvent.setup();
    renderWithRouter(<GoalsPanel />);
    await user.click(await screen.findByRole("button", { name: "Edit goal: Belajar rutin" }));
    await user.click(screen.getByRole("combobox", { name: "Tambah habit" }));
    await user.click(await screen.findByRole("option", { name: "Olahraga" }));
    expect(screen.getByRole("button", { name: "Batalkan penambahan Olahraga" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(calls.some(({ url, init }) => url === "/api/v1/goals/goal-1" && init?.method === "PATCH")).toBe(true));
    const patch = calls.find(({ url, init }) => url === "/api/v1/goals/goal-1" && init?.method === "PATCH");
    expect(JSON.parse(String(patch?.init?.body))).toMatchObject({ addHabitIds: [extraHabit.id], removeHabitIds: [] });
  });

  it("UI-20 unassigns one of multiple habits and disables unassigning the last", async () => {
    const twoHabitGoal = { ...goal, habitCount: 2, habitLinks: [{ habit }, { habit: extraHabit }] };
    const { calls } = setupFetch({ goals: { goals: [twoHabitGoal] } });
    const user = userEvent.setup();
    renderWithRouter(<GoalsPanel />);
    await user.click(await screen.findByRole("button", { name: "Edit goal: Belajar rutin" }));
    await user.click(screen.getByRole("button", { name: "Lepas Membaca dari goal Belajar rutin" }));
    expect(screen.getByRole("status")).toHaveTextContent("Akan dilepas");
    const lastHabitRemoveButton = screen.getByRole("button", { name: "Lepas Olahraga dari goal Belajar rutin" });
    expect(lastHabitRemoveButton).toBeDisabled();
    expect(lastHabitRemoveButton).toHaveAttribute("aria-describedby", "goal-last-habit-goal-1");
    expect(screen.getByText(/Goal wajib memiliki minimal satu habit/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(calls.some(({ url, init }) => url === "/api/v1/goals/goal-1" && init?.method === "PATCH")).toBe(true));
    const patch = calls.find(({ url, init }) => url === "/api/v1/goals/goal-1" && init?.method === "PATCH");
    expect(JSON.parse(String(patch?.init?.body))).toMatchObject({ removeHabitIds: [habit.id] });
  });

  it("UI-21 creates and assigns an inline habit atomically, with a safe retry after failure", async () => {
    const { calls, fetchMock } = setupFetch({ goals: { goals: [goal] } });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(init === undefined ? { url } : { url, init });
      if (url.includes("auth/refresh")) return sessionResponse();
      if (url === "/api/v1/goals/goal-1" && init?.method === "PATCH") {
        const updateAttempts = calls.filter((call) => call.url === url && call.init?.method === "PATCH").length;
        if (updateAttempts === 1) {
          return jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Perubahan goal gagal disimpan." } }, 500);
        }
        return jsonResponse({ goal: { ...goal, habitLinks: [...goal.habitLinks, { habit: { id: "created-yoga", title: "Yoga", type: "NEGATIVE" } }] }, createdHabitIds: ["created-yoga"] });
      }
      if (url === "/api/v1/goals") return jsonResponse({ goals: [goal] });
      if (url === "/api/v1/habits") return jsonResponse({ habits: [habit, extraHabit] });
      return jsonResponse({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
    });
    const user = userEvent.setup();
    renderWithRouter(<GoalsPanel />);
    await user.click(await screen.findByRole("button", { name: "Edit goal: Belajar rutin" }));
    await user.click(screen.getByRole("combobox", { name: "Tambah habit" }));
    await user.click(await screen.findByRole("option", { name: /Buat habit baru/ }));
    await user.type(screen.getByRole("textbox", { name: "Nama habit baru" }), "Yoga");
    await user.click(screen.getByRole("radio", { name: "Negatif — menghentikan kebiasaan" }));
    await user.click(screen.getByRole("button", { name: "Tambahkan saat menyimpan" }));
    await user.click(screen.getByRole("button", { name: "Simpan" }));
    expect(await screen.findByText("Perubahan goal gagal disimpan.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nama habit baru" })).toHaveValue("Yoga");
    expect(screen.getByRole("button", { name: "Simpan" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(calls.filter(({ url, init }) => url === "/api/v1/goals/goal-1" && init?.method === "PATCH")).toHaveLength(2));
    for (const { init } of calls.filter(({ url, init }) => url === "/api/v1/goals/goal-1" && init?.method === "PATCH")) {
      expect(JSON.parse(String(init?.body))).toMatchObject({ newHabits: [{ title: "Yoga", type: "NEGATIVE" }] });
    }
    expect(await screen.findByText("Goal dan habit yang terhubung berhasil diperbarui.")).toBeInTheDocument();
  });
});
