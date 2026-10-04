import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../app/page";
import { jsonResponse, renderWithRouter, router, sessionResponse } from "./test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => router }));

const habits = [
  { id: "positive-1", title: "Membaca", type: "POSITIVE", checkedIn: false },
  { id: "negative-1", title: "Tidak merokok", type: "NEGATIVE", checkedIn: true },
];

function installFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/auth/refresh")) return sessionResponse();
    if (url === "/api/v1/habits") return jsonResponse({ habits });
    if (url.endsWith("positive-1/check-in") && init?.method === "POST") return jsonResponse({ habitId: "positive-1", date: "2026-10-04", streak: { current: 1, longest: 1 } });
    if (url.endsWith("negative-1/check-in") && init?.method === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("range=daily")) return jsonResponse({ habitId: "positive-1", current: 4, longest: 9, lastDoneDate: "2026-10-03" });
    if (url.includes("range=weekly")) return jsonResponse({ habitId: "positive-1", weekStart: "2026-09-28", weekEnd: "2026-10-04", done: 4, miss: 2, allowance: 3, remaining: 1, days: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"].map((date, index) => ({ date, status: index < 4 ? "DONE" : "MISS" })) });
    return jsonResponse({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("today habit list", () => {
  beforeEach(() => {
    router.replace.mockReset();
    installFetch();
  });

  it("UI-02 renders today's habit status from the API", async () => {
    renderWithRouter(<Home />);
    expect(await screen.findByRole("list", { name: "Daftar habit hari ini" })).toBeInTheDocument();
    expect(screen.getByText("Membaca")).toBeInTheDocument();
    expect(screen.getByText("Belum ditandai")).toBeInTheDocument();
    expect(screen.getByText("Hari bersih")).toBeInTheDocument();
  });

  it("UI-03 checks in a positive habit and announces completion", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    renderWithRouter(<Home />);
    await screen.findByText("Membaca");
    await user.click(screen.getByRole("button", { name: "Tandai selesai: Membaca" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/habits/positive-1/check-in", expect.objectContaining({ method: "POST" })));
    expect(await screen.findByRole("status")).toHaveTextContent("Selesai: Membaca");
  });

  it("UI-04 uses the clean-day label for a negative habit", async () => {
    renderWithRouter(<Home />);
    expect(await screen.findByRole("button", { name: "Batalkan check-in: Tidak merokok" })).toHaveAttribute("title", "Batalkan check-in");
    expect(screen.getByText("Hari bersih")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tandai selesai: Tidak merokok" })).not.toBeInTheDocument();
  });

  it("UI-05 undoes today's check-in and returns the habit to pending", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    renderWithRouter(<Home />);
    await user.click(await screen.findByRole("button", { name: "Batalkan check-in: Tidak merokok" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/habits/negative-1/check-in", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByRole("button", { name: "Tandai hari bersih: Tidak merokok" })).toBeInTheDocument();
  });

  it("UI-06 displays daily streak values when details are opened", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Home />);
    await user.click(await screen.findByRole("button", { name: "Tampilkan streak dan kalender mingguan: Membaca" }));
    expect(await screen.findByText("Streak saat ini")).toBeInTheDocument();
    expect(screen.getByText("4 hari")).toBeInTheDocument();
    expect(screen.getByText("9 hari")).toBeInTheDocument();
    expect(screen.getByText("3 Oktober 2026")).toBeInTheDocument();
  });

  it("UI-07 displays the weekly summary and the Monday-to-Sunday days", async () => {
    const user = userEvent.setup();
    renderWithRouter(<Home />);
    await user.click(await screen.findByRole("button", { name: "Tampilkan streak dan kalender mingguan: Membaca" }));
    expect(await screen.findByText("Done 4/7 · Miss 2 · Sisa toleransi 1")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Senin sampai Minggu" }).children).toHaveLength(7);
  });

  it("UI-08 requests the previous week using a Monday date", async () => {
    const user = userEvent.setup();
    const fetchMock = installFetch();
    renderWithRouter(<Home />);
    await user.click(await screen.findByRole("button", { name: "Tampilkan streak dan kalender mingguan: Membaca" }));
    await screen.findByText("Done 4/7 · Miss 2 · Sisa toleransi 1");
    await user.click(screen.getByRole("button", { name: "Lihat minggu sebelumnya untuk Membaca" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("week=2026-09-21"), expect.anything()));
  });

  it("UI-13 renders a friendly API error instead of crashing", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(sessionResponse())
      .mockResolvedValueOnce(jsonResponse({ error: { code: "NOT_FOUND", message: "missing" } }, 404)));
    renderWithRouter(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Daftar habit belum dapat dimuat.");
  });

  it("UI-15 filters and searches the loaded habit list without more requests", async () => {
    const fetchMock = installFetch();
    const user = userEvent.setup();
    renderWithRouter(<Home />);
    await screen.findByText("Membaca");
    const initialRequestCount = fetchMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Positif (1)" }));
    expect(screen.getByText("Membaca")).toBeInTheDocument();
    expect(screen.queryByText("Tidak merokok")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Semua (2)" }));
    await user.type(screen.getByRole("searchbox", { name: "Cari judul habit" }), "merokok");
    expect(screen.getByText("Tidak merokok")).toBeInTheDocument();
    expect(screen.queryByText("Membaca")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(initialRequestCount);
  });

  it("UI-17 requires a replacement for each affected goal before deleting a habit", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("auth/refresh")) return sessionResponse();
      if (url === "/api/v1/habits") return jsonResponse({ habits: [...habits, { id: "replacement", title: "Olahraga", type: "POSITIVE", checkedIn: false }] });
      if (url === "/api/v1/goals") return jsonResponse({ goals: [
        { id: "goal-a", title: "Sehat", habitLinks: [{ habit: { id: "positive-1" } }] },
        { id: "goal-b", title: "Rutin", habitLinks: [{ habit: { id: "positive-1" } }] },
      ] });
      if (url.endsWith("positive-1") && init?.method === "DELETE") return new Response(null, { status: 204 });
      return jsonResponse({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderWithRouter(<Home />);
    await user.click(await screen.findByRole("button", { name: "Hapus habit: Membaca" }));
    const dialog = await screen.findByRole("dialog", { name: "Hapus habit?" });
    expect(await screen.findByText("Goal berikut memerlukan habit pengganti")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Hapus habit$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Pilih habit pengganti untuk setiap goal");
    expect(fetchMock.mock.calls.some(([url, init]) => String(url).endsWith("positive-1") && init?.method === "DELETE")).toBe(false);

    const replacementPickers = screen.getAllByRole("combobox");
    await user.click(replacementPickers[0]!);
    await user.click(await screen.findByRole("option", { name: /Olahraga/ }));
    await user.click(replacementPickers[1]!);
    await user.click(await screen.findByRole("option", { name: "Buat habit baru untuk pengganti" }));
    await user.type(screen.getByRole("textbox", { name: "Nama habit baru" }), "Yoga");
    await user.click(screen.getByRole("radio", { name: "Negatif — menghentikan kebiasaan" }));
    await user.click(within(dialog).getByRole("button", { name: "Hapus habit" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/v1/habits/positive-1", expect.objectContaining({ method: "DELETE" })));
    const deletion = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("positive-1") && init?.method === "DELETE");
    expect(JSON.parse(String(deletion?.[1]?.body))).toMatchObject({
      goalReplacements: [{ goalId: "goal-a", habitId: "replacement" }],
      newHabitGoalIds: ["goal-b"],
      newHabit: { title: "Yoga", type: "NEGATIVE" },
    });
  });

  it("UI-18 creates a habit with selected type and reports API errors", async () => {
    const fetchMock = installFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("auth/refresh")) return sessionResponse();
      if (url === "/api/v1/habits" && init?.method === "POST") return jsonResponse({ habit: { id: "new-habit", title: "Lari pagi", type: "NEGATIVE", checkedIn: false } }, 201);
      if (url === "/api/v1/habits") return jsonResponse({ habits });
      return jsonResponse({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
    });
    const user = userEvent.setup();
    renderWithRouter(<Home />);
    await user.click(await screen.findByRole("button", { name: "Tambah habit" }));
    await user.type(screen.getByRole("textbox", { name: "Nama habit" }), "Lari pagi");
    await user.type(screen.getByRole("textbox", { name: /Deskripsi/ }), "Setiap pagi");
    await user.click(screen.getByRole("radio", { name: "Negatif — menghentikan kebiasaan" }));
    await user.click(screen.getByRole("button", { name: "Simpan habit" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Habit berhasil ditambahkan");
    const request = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/habits" && init?.method === "POST");
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ title: "Lari pagi", type: "NEGATIVE", description: "Setiap pagi" });

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("auth/refresh")) return sessionResponse();
      if (url === "/api/v1/habits" && init?.method === "POST") return jsonResponse({ error: { code: "VALIDATION_ERROR", message: "Nama habit tidak valid." } }, 400);
      if (url === "/api/v1/habits") return jsonResponse({ habits });
      return jsonResponse({ error: { code: "NOT_FOUND", message: "Tidak ditemukan." } }, 404);
    });
    await user.click(screen.getByRole("button", { name: "Tambah habit" }));
    await user.type(screen.getByRole("textbox", { name: "Nama habit" }), "Invalid");
    await user.click(screen.getByRole("button", { name: "Simpan habit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Habit belum dapat ditambahkan");
  });
});
