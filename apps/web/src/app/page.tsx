"use client";

import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { getAuthSession, setAuthSession, type AuthUser } from "./auth/auth-session";
import SectionNavigation from "./section-navigation";
import HabitTypeToggle from "@/components/habit-type-toggle";
import BrandLogo from "@/components/brand-logo";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type HabitSummary = {
  id: string;
  title: string;
  type: "POSITIVE" | "NEGATIVE";
  checkedIn: boolean;
  description?: string | null;
};

type DailyStreak = {
  habitId: string;
  current: number;
  longest: number;
  lastDoneDate: string | null;
};

type WeeklyDay = {
  date: string;
  status: "DONE" | "MISS" | "PENDING" | "FUTURE";
};

type WeeklyStreak = {
  habitId: string;
  weekStart: string;
  weekEnd: string;
  done: number;
  miss: number;
  allowance: 3;
  remaining: number;
  days: WeeklyDay[];
};

type SessionResponse = {
  accessToken: string;
  user: AuthUser;
};

type GoalForReplacement = { id: string; title: string };
type GoalListForReplacement = {
  goals: Array<{
    id: string;
    title: string;
    habitLinks: Array<{ habit: { id: string } }>;
  }>;
};

function isGoalListForReplacement(value: unknown): value is GoalListForReplacement {
  return isRecord(value) && Array.isArray(value["goals"]) && value["goals"].every((goal: unknown) =>
    isRecord(goal) && typeof goal["id"] === "string" && typeof goal["title"] === "string" &&
    Array.isArray(goal["habitLinks"]) && goal["habitLinks"].every((link: unknown) =>
      isRecord(link) && isRecord(link["habit"]) && typeof link["habit"]["id"] === "string"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!isRecord(value) || typeof value["accessToken"] !== "string") return false;
  const user = value["user"];
  if (!isRecord(user)) return false;
  return (
    typeof user["id"] === "string" &&
    typeof user["email"] === "string" &&
    (typeof user["name"] === "string" || user["name"] === null)
  );
}

function isHabitList(value: unknown): value is { habits: HabitSummary[] } {
  if (!isRecord(value) || !Array.isArray(value["habits"])) return false;
  return value["habits"].every(
    (habit: unknown) =>
      isRecord(habit) &&
      typeof habit["id"] === "string" &&
      typeof habit["title"] === "string" &&
      (habit["type"] === "POSITIVE" || habit["type"] === "NEGATIVE") &&
      typeof habit["checkedIn"] === "boolean",
  );
}

function isCreatedHabit(value: unknown): value is HabitSummary {
  return isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["title"] === "string" &&
    (value["type"] === "POSITIVE" || value["type"] === "NEGATIVE") &&
    typeof value["checkedIn"] === "boolean";
}

function mergeHabit(habits: HabitSummary[], habit: HabitSummary): HabitSummary[] {
  return [habit, ...habits.filter((item) => item.id !== habit.id)];
}

function isDailyStreak(value: unknown): value is DailyStreak {
  return (
    isRecord(value) &&
    typeof value["habitId"] === "string" &&
    typeof value["current"] === "number" &&
    Number.isInteger(value["current"]) &&
    value["current"] >= 0 &&
    typeof value["longest"] === "number" &&
    Number.isInteger(value["longest"]) &&
    value["longest"] >= 0 &&
    (value["lastDoneDate"] === null ||
      (typeof value["lastDoneDate"] === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value["lastDoneDate"])))
  );
}

function isWeeklyStreak(value: unknown): value is WeeklyStreak {
  if (!isRecord(value) || !Array.isArray(value["days"])) return false;
  return (
    typeof value["habitId"] === "string" &&
    typeof value["weekStart"] === "string" &&
    typeof value["weekEnd"] === "string" &&
    typeof value["done"] === "number" &&
    typeof value["miss"] === "number" &&
    value["allowance"] === 3 &&
    typeof value["remaining"] === "number" &&
    value["days"].length === 7 &&
    value["days"].every(
      (day: unknown) =>
        isRecord(day) &&
        typeof day["date"] === "string" &&
        ["DONE", "MISS", "PENDING", "FUTURE"].includes(String(day["status"])),
    )
  );
}

async function refreshAccessToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body: unknown = await response.json();
    if (!isSessionResponse(body)) return null;

    setAuthSession(body.accessToken, body.user);
    return body.accessToken;
  } catch {
    return null;
  }
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  let { accessToken } = getAuthSession();
  if (accessToken === null) accessToken = await refreshAccessToken();
  if (accessToken === null) return null;

  const sendRequest = (token: string): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers, cache: "no-store" });
  };

  let response = await sendRequest(accessToken);
  if (response.status === 401) {
    accessToken = await refreshAccessToken();
    if (accessToken === null) return null;
    response = await sendRequest(accessToken);
  }
  if (response.status === 401) {
    setAuthSession(null, null);
    return null;
  }
  return response;
}

function formatDate(date: string | null): string {
  if (date === null) return "Belum ada check-in";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatWeekDay(date: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatWeekdayAbbreviation(date: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function formatDayOfMonth(date: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function addCalendarDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export default function Home(): JSX.Element {
  const router = useRouter();
  const [habits, setHabits] = useState<HabitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [pendingHabitIds, setPendingHabitIds] = useState<Set<string>>(() => new Set());
  const [expandedStreakId, setExpandedStreakId] = useState<string | null>(null);
  const [expandedWeeklyId, setExpandedWeeklyId] = useState<string | null>(null);
  const [detailsPreparingIds, setDetailsPreparingIds] = useState<Set<string>>(() => new Set());
  const detailsPreparingRef = useRef(new Set<string>());
  const [streakDetails, setStreakDetails] = useState<Record<string, DailyStreak>>({});
  const [streakLoadingIds, setStreakLoadingIds] = useState<Set<string>>(() => new Set());
  const [streakErrors, setStreakErrors] = useState<Record<string, string>>({});
  const [weeklyStreaks, setWeeklyStreaks] = useState<Record<string, WeeklyStreak>>({});
  const [weeklyLoadingIds, setWeeklyLoadingIds] = useState<Set<string>>(() => new Set());
  const [weeklyErrors, setWeeklyErrors] = useState<Record<string, string>>({});
  const [typeFilter, setTypeFilter] = useState<"ALL" | "POSITIVE" | "NEGATIVE">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createType, setCreateType] = useState<"POSITIVE" | "NEGATIVE">("POSITIVE");
  const [createDescription, setCreateDescription] = useState("");
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState("");
  const [editingHabitId, setEditingHabitId] = useState<string | null>(null);
  const [editHabitTitle, setEditHabitTitle] = useState("");
  const [editHabitDescription, setEditHabitDescription] = useState("");
  const [editHabitPending, setEditHabitPending] = useState(false);
  const [editHabitError, setEditHabitError] = useState("");
  const [deletingHabit, setDeletingHabit] = useState<HabitSummary | null>(null);
  const [affectedGoals, setAffectedGoals] = useState<GoalForReplacement[]>([]);
  const [replacementByGoal, setReplacementByGoal] = useState<Record<string, string>>({});
  const [replacementPickerOpen, setReplacementPickerOpen] = useState<Record<string, boolean>>({});
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementNewTitle, setReplacementNewTitle] = useState("");
  const [replacementNewType, setReplacementNewType] = useState<"POSITIVE" | "NEGATIVE">("POSITIVE");
  const [replacementNewDescription, setReplacementNewDescription] = useState("");
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = deleteDialogRef.current;
    if (deletingHabit !== null && dialog !== null && !dialog.open) dialog.showModal();
    if (deletingHabit === null && dialog?.open) dialog.close();
  }, [deletingHabit]);

  useEffect(() => {
    let active = true;
    async function loadToday(): Promise<void> {
      try {
        const sessionResponse = await fetch("/api/v1/auth/refresh", { method: "POST" });
        if (!sessionResponse.ok) {
          router.replace("/auth");
          return;
        }
        const sessionBody: unknown = await sessionResponse.json();
        if (!isSessionResponse(sessionBody)) {
          router.replace("/auth");
          return;
        }
        setAuthSession(sessionBody.accessToken, sessionBody.user);

        const listResponse = await fetch("/api/v1/habits", {
          headers: { authorization: `Bearer ${sessionBody.accessToken}` },
          cache: "no-store",
        });
        if (listResponse.status === 401) {
          setAuthSession(null, null);
          router.replace("/auth");
          return;
        }
        const listBody: unknown = await listResponse.json();
        if (!listResponse.ok) {
          setError("Daftar habit belum dapat dimuat. Silakan coba lagi.");
        } else if (!isHabitList(listBody)) {
          setError("Respons daftar habit tidak dikenali.");
        } else if (active) {
           let loadedHabits = listBody.habits;
           try {
             const pendingCreated = window.sessionStorage.getItem("habit-shaper:pending-created-habit");
             if (pendingCreated !== null) {
               const pendingHabit: unknown = JSON.parse(pendingCreated);
               if (isCreatedHabit(pendingHabit)) loadedHabits = mergeHabit(loadedHabits, pendingHabit);
               window.sessionStorage.removeItem("habit-shaper:pending-created-habit");
             }
           } catch {
             window.sessionStorage.removeItem("habit-shaper:pending-created-habit");
           }
           setHabits(loadedHabits);
           // Weekly history is fetched only when the user opens a habit's calendar.
        }
      } catch {
        if (active) setError("Tidak dapat menghubungi layanan. Coba muat ulang halaman.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadToday();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    function onHabitCreated(event: Event): void {
      if (!(event instanceof CustomEvent) || !isCreatedHabit(event.detail)) return;
      setHabits((current) => mergeHabit(current, event.detail));
      setTypeFilter("ALL");
      setSearchQuery("");
      setAnnouncement(`Habit “${event.detail.title}” berhasil ditambahkan.`);
    }
    window.addEventListener("habit-shaper:habit-created", onHabitCreated);
    return () => window.removeEventListener("habit-shaper:habit-created", onHabitCreated);
  }, []);

  async function loadStreakDetails(habitId: string): Promise<void> {
    setStreakLoadingIds((current) => new Set(current).add(habitId));
    setStreakErrors((current) => {
      const next = { ...current };
      delete next[habitId];
      return next;
    });
    try {
      const response = await authorizedFetch(
        `/api/v1/habits/${encodeURIComponent(habitId)}/streak?range=daily`,
      );
      if (response === null) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        setStreakErrors((current) => ({
          ...current,
          [habitId]: "Detail streak belum dapat dimuat. Silakan coba lagi.",
        }));
        return;
      }
      const body: unknown = await response.json();
      if (!isDailyStreak(body) || body.habitId !== habitId) {
        setStreakErrors((current) => ({
          ...current,
          [habitId]: "Respons detail streak tidak dikenali.",
        }));
        return;
      }
      setStreakDetails((current) => ({ ...current, [habitId]: body }));
    } catch {
      setStreakErrors((current) => ({
        ...current,
        [habitId]: "Tidak dapat menghubungi layanan. Silakan coba lagi.",
      }));
    } finally {
      setStreakLoadingIds((current) => {
        const next = new Set(current);
        next.delete(habitId);
        return next;
      });
    }
  }

  async function loadAdjacentWeek(
    habitId: string,
    currentWeekStart: string,
    direction: "previous" | "next",
  ): Promise<void> {
    const requestedWeek = addCalendarDays(currentWeekStart, direction === "previous" ? -7 : 7);
    setWeeklyLoadingIds((current) => new Set(current).add(habitId));
    setWeeklyErrors((current) => {
      const next = { ...current };
      delete next[habitId];
      return next;
    });
    try {
      const queryDate = encodeURIComponent(requestedWeek);
      const response = await authorizedFetch(
        `/api/v1/habits/${encodeURIComponent(habitId)}/streak?range=weekly&week=${queryDate}`,
      );
      if (response === null) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) throw new Error("weekly");
      const body: unknown = await response.json();
      if (!isWeeklyStreak(body) || body.habitId !== habitId || body.weekStart !== requestedWeek) {
        throw new Error("weekly");
      }
      setWeeklyStreaks((current) => ({ ...current, [habitId]: body }));
    } catch {
      setWeeklyErrors((current) => ({
        ...current,
        [habitId]: "Minggu yang dipilih belum dapat dimuat. Silakan coba lagi.",
      }));
    } finally {
      setWeeklyLoadingIds((current) => {
        const next = new Set(current);
        next.delete(habitId);
        return next;
      });
    }
  }

  async function loadWeeklyForHabit(habitId: string, force = false): Promise<void> {
    const cachedWeek = weeklyStreaks[habitId];
    if ((!force && cachedWeek !== undefined) || weeklyLoadingIds.has(habitId)) return;
    setWeeklyLoadingIds((current) => new Set(current).add(habitId));
    setWeeklyErrors((current) => {
      const next = { ...current };
      delete next[habitId];
      return next;
    });
    try {
      const weekQuery = force && cachedWeek !== undefined
        ? `&week=${encodeURIComponent(cachedWeek.weekStart)}`
        : "";
      const response = await authorizedFetch(
        `/api/v1/habits/${encodeURIComponent(habitId)}/streak?range=weekly${weekQuery}`,
      );
      if (response === null) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) throw new Error("weekly");
      const body: unknown = await response.json();
      if (!isWeeklyStreak(body) || body.habitId !== habitId) throw new Error("weekly");
      setWeeklyStreaks((current) => ({ ...current, [habitId]: body }));
    } catch {
      setWeeklyErrors((current) => ({ ...current, [habitId]: "Ringkasan mingguan belum dapat dimuat." }));
    } finally {
      setWeeklyLoadingIds((current) => {
        const next = new Set(current);
        next.delete(habitId);
        return next;
      });
    }
  }

  async function toggleCheckIn(habit: HabitSummary): Promise<void> {
    if (pendingHabitIds.has(habit.id)) return;
    setPendingHabitIds((current) => new Set(current).add(habit.id));
    setActionError("");
    setAnnouncement("");

    try {
      const response = await authorizedFetch(
        `/api/v1/habits/${encodeURIComponent(habit.id)}/check-in`,
        {
          method: habit.checkedIn ? "DELETE" : "POST",
          ...(habit.checkedIn
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify({}),
              }),
        },
      );
      if (response === null) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        let message = "Perubahan check-in gagal. Silakan coba lagi.";
        try {
          const body: unknown = await response.json();
          if (
            isRecord(body) &&
            isRecord(body["error"]) &&
            typeof body["error"]["message"] === "string"
          ) {
            message = body["error"]["message"];
          }
        } catch {
          // Keep the readable fallback when the response has no JSON body.
        }
        setActionError(message);
        return;
      }

      const checkedIn = !habit.checkedIn;
      setHabits((current) =>
        current.map((item) => (item.id === habit.id ? { ...item, checkedIn } : item)),
      );
      setStreakDetails((current) => {
        const next = { ...current };
        delete next[habit.id];
        return next;
      });
      setWeeklyStreaks((current) => {
        const next = { ...current };
        delete next[habit.id];
        return next;
      });
      if (expandedStreakId === habit.id) void loadStreakDetails(habit.id);
      if (expandedWeeklyId === habit.id) void loadWeeklyForHabit(habit.id, true);
      setAnnouncement(
        checkedIn
          ? `${habit.type === "NEGATIVE" ? "Hari bersih" : "Selesai"}: ${habit.title}.`
          : `Check-in ${habit.title} dibatalkan.`,
      );
    } catch {
      setActionError("Tidak dapat menghubungi layanan. Periksa koneksi lalu coba lagi.");
    } finally {
      setPendingHabitIds((current) => {
        const next = new Set(current);
        next.delete(habit.id);
        return next;
      });
    }
  }

  async function toggleHabitDetails(habitId: string): Promise<void> {
    if (expandedStreakId === habitId || expandedWeeklyId === habitId) {
      setExpandedStreakId(null);
      setExpandedWeeklyId(null);
      return;
    }
    if (detailsPreparingRef.current.has(habitId)) return;

    detailsPreparingRef.current.add(habitId);
    setDetailsPreparingIds((current) => new Set(current).add(habitId));
    const requests: Promise<void>[] = [];
    if (streakDetails[habitId] === undefined || streakErrors[habitId] !== undefined) {
      requests.push(loadStreakDetails(habitId));
    }
    if (weeklyStreaks[habitId] === undefined || weeklyErrors[habitId] !== undefined) {
      requests.push(loadWeeklyForHabit(habitId));
    }

    try {
      await Promise.all(requests);
    } finally {
      detailsPreparingRef.current.delete(habitId);
      setDetailsPreparingIds((current) => {
        const next = new Set(current);
        next.delete(habitId);
        return next;
      });
      setExpandedStreakId(habitId);
      setExpandedWeeklyId(habitId);
    }
  }

  async function createHabit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (createPending) return;
    setCreatePending(true);
    setCreateError("");
    try {
      const response = await authorizedFetch("/api/v1/habits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: createTitle,
          type: createType,
          ...(createDescription.trim() ? { description: createDescription } : {}),
        }),
      });
      if (response === null) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) throw new Error("create");
      const body: unknown = await response.json();
      if (
        !isRecord(body) || !isRecord(body["habit"]) ||
        typeof body["habit"]["id"] !== "string" ||
        typeof body["habit"]["title"] !== "string" ||
        (body["habit"]["type"] !== "POSITIVE" && body["habit"]["type"] !== "NEGATIVE")
      ) throw new Error("create-response");
      const newHabit: HabitSummary = {
        id: body["habit"]["id"],
        title: body["habit"]["title"],
        type: body["habit"]["type"],
        checkedIn: false,
      };
      setHabits((current) => mergeHabit(current, newHabit));
      setTypeFilter("ALL");
      setSearchQuery("");
      setCreateTitle("");
      setCreateDescription("");
      setCreateOpen(false);
      setAnnouncement("Habit berhasil ditambahkan.");
    } catch {
      setCreateError("Habit belum dapat ditambahkan. Periksa isian lalu coba lagi.");
    } finally {
      setCreatePending(false);
    }
  }

  function startEditHabit(habit: HabitSummary): void {
    if (editingHabitId === habit.id) {
      setEditingHabitId(null);
      setEditHabitError("");
      return;
    }
    setEditingHabitId(habit.id);
    setEditHabitTitle(habit.title);
    setEditHabitDescription(habit.description ?? "");
    setEditHabitError("");
    setActionError("");
    setAnnouncement("");
  }

  async function saveHabitEdit(event: React.FormEvent<HTMLFormElement>, habit: HabitSummary): Promise<void> {
    event.preventDefault();
    if (editHabitPending) return;
    const title = editHabitTitle.trim();
    if (!title) {
      setEditHabitError("Nama habit wajib diisi.");
      return;
    }
    setEditHabitPending(true);
    setEditHabitError("");
    try {
      const response = await authorizedFetch(`/api/v1/habits/${encodeURIComponent(habit.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description: editHabitDescription.trim() || null }),
      });
      if (response === null) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        setEditHabitError("Habit gagal diperbarui. Periksa isian lalu coba lagi.");
        return;
      }
      const body: unknown = await response.json();
      if (!isRecord(body) || !isRecord(body["habit"]) ||
        body["habit"]["id"] !== habit.id || typeof body["habit"]["title"] !== "string") {
        setEditHabitError("Respons pembaruan tidak valid. Coba muat ulang daftar habit.");
        return;
      }
      const updated = { ...habit, title: body["habit"]["title"], description:
        typeof body["habit"]["description"] === "string" ? body["habit"]["description"] : null };
      setHabits((current) => current.map((item) => item.id === habit.id ? updated : item));
      setEditingHabitId(null);
      setAnnouncement("Habit berhasil diperbarui.");
    } catch {
      setEditHabitError("Tidak dapat menghubungi layanan. Perubahan belum dikonfirmasi.");
    } finally {
      setEditHabitPending(false);
    }
  }

  async function openDeleteDialog(habit: HabitSummary): Promise<void> {
    setDeletingHabit(habit);
    setAffectedGoals([]);
    setReplacementByGoal({});
    setReplacementPickerOpen({});
    setDeleteError("");
    setReplacementLoading(true);
    try {
      const response = await authorizedFetch("/api/v1/goals");
      if (response === null) {
        router.replace("/auth");
        setDeletingHabit(null);
        return;
      }
      const body: unknown = await response.json();
      if (!response.ok || !isGoalListForReplacement(body)) throw new Error("goals");
      const goals = body.goals
        .filter((goal) => goal.habitLinks.length === 1 && goal.habitLinks[0]?.habit.id === habit.id)
        .map(({ id, title }) => ({ id, title }));
      setAffectedGoals(goals);
    } catch {
      setDeleteError("Goal yang terkait belum dapat dimuat. Habit belum dihapus.");
    } finally {
      setReplacementLoading(false);
    }
  }

  function closeDeleteDialog(): void {
    if (deletePending) return;
    setDeletingHabit(null);
    setAffectedGoals([]);
    setReplacementByGoal({});
    setReplacementPickerOpen({});
    setDeleteError("");
  }

  async function confirmDeleteHabit(): Promise<void> {
    if (deletingHabit === null || deletePending || replacementLoading) return;
    if (affectedGoals.some((goal) => !replacementByGoal[goal.id])) {
      setDeleteError("Pilih habit pengganti untuk setiap goal sebelum menghapus.");
      return;
    }
    const useNewHabitFor = affectedGoals
      .filter((goal) => replacementByGoal[goal.id] === "__new__")
      .map((goal) => goal.id);
    if (useNewHabitFor.length > 0 && replacementNewTitle.trim().length === 0) {
      setDeleteError("Isi nama habit baru yang akan digunakan sebagai pengganti.");
      return;
    }
    setDeletePending(true);
    setDeleteError("");
    try {
      const response = await authorizedFetch(`/api/v1/habits/${encodeURIComponent(deletingHabit.id)}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goalReplacements: affectedGoals
            .filter((goal) => replacementByGoal[goal.id] !== "__new__")
            .map((goal) => ({ goalId: goal.id, habitId: replacementByGoal[goal.id] })),
          newHabitGoalIds: useNewHabitFor,
          ...(useNewHabitFor.length > 0
            ? {
                newHabit: {
                  title: replacementNewTitle,
                  type: replacementNewType,
                  ...(replacementNewDescription.trim()
                    ? { description: replacementNewDescription }
                    : {}),
                },
              }
            : {}),
        }),
      });
      if (response === null) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        let message = "Habit belum dapat dihapus. Periksa pengganti lalu coba lagi.";
        try {
          const body: unknown = await response.json();
          if (isRecord(body) && isRecord(body["error"]) && typeof body["error"]["message"] === "string") {
            message = body["error"]["message"];
          }
        } catch {
          // Keep the readable fallback for non-JSON errors.
        }
        setDeleteError(message);
        return;
      }
      setHabits((current) => current.filter((item) => item.id !== deletingHabit.id));
      setWeeklyStreaks((current) => {
        const next = { ...current };
        delete next[deletingHabit.id];
        return next;
      });
      setDeletingHabit(null);
      setAnnouncement(`Habit “${deletingHabit.title}” berhasil dihapus.`);
    } catch {
      setDeleteError("Tidak dapat menghubungi layanan. Habit belum dihapus.");
    } finally {
      setDeletePending(false);
    }
  }

  const visibleHabits = useMemo(() => habits.filter((habit) =>
    (typeFilter === "ALL" || habit.type === typeFilter) &&
    habit.title.toLocaleLowerCase("id-ID").includes(searchQuery.trim().toLocaleLowerCase("id-ID"))),
  [habits, typeFilter, searchQuery]);

  return (
    <main className="today-page">
      <header className="today-header">
        <div className="today-header-panel">
          <div className="today-heading">
            <BrandLogo />
            <h1>Habits</h1>
            <p>Langkah kecil yang kamu lakukan hari ini tetap berarti.</p>
          </div>
          <SectionNavigation active="habit" />
        </div>
      </header>
      <div className="habit-toolbar">
        <div className="habit-filters" role="group" aria-label="Filter jenis habit">
          {([
            ["ALL", `Semua (${habits.length})`],
            ["POSITIVE", `Positif (${habits.filter((item) => item.type === "POSITIVE").length})`],
            ["NEGATIVE", `Negatif (${habits.filter((item) => item.type === "NEGATIVE").length})`],
          ] as const).map(([filter, label]) => (
            <button
              className={typeFilter === filter ? "habit-filter is-active" : "habit-filter"}
              type="button"
              key={filter}
              aria-pressed={typeFilter === filter}
              onClick={() => setTypeFilter(filter)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="habit-search">
          <span>Cari judul habit</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Contoh: olahraga"
          />
        </label>
        <button
          className="add-habit-button"
          type="button"
          aria-label={createOpen ? "Tutup form tambah habit" : "Tambah habit"}
          title={createOpen ? "Tutup form tambah habit" : "Tambah habit"}
          onClick={() => setCreateOpen((value) => !value)}
        >
          {createOpen ? (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          )}
        </button>
      </div>
      {createOpen ? (
        <form className="habit-create-form" onSubmit={(event) => void createHabit(event)}>
          <h2>Habit baru</h2>
          <label>
            Nama habit
            <input required maxLength={120} value={createTitle} onChange={(event) => setCreateTitle(event.target.value)} />
          </label>
          <div className="habit-form-select-field">
            <span className="habit-type-label">Jenis habit</span>
            <HabitTypeToggle value={createType} onValueChange={setCreateType} />
          </div>
          <label>
            Deskripsi <span className="optional">(opsional)</span>
            <textarea maxLength={500} value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} />
          </label>
          {createError ? <p className="error-message" role="alert">{createError}</p> : null}
          <button className="check-in-button" type="submit" disabled={createPending}>
            {createPending ? "Menyimpan…" : "Simpan habit"}
          </button>
        </form>
      ) : null}
      {loading ? (
        <p className="loading-message" role="status">
          Memuat daftar habit…
        </p>
      ) : error ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : habits.length === 0 ? (
        <section className="empty-state" aria-labelledby="empty-title">
          <span className="empty-mark" aria-hidden="true">
            ✳
          </span>
          <h2 id="empty-title">Belum ada habit</h2>
          <p>Habit yang kamu buat akan tampil di sini.</p>
        </section>
      ) : visibleHabits.length === 0 ? (
        <p className="empty-filter-state">Tidak ada habit yang cocok dengan filter atau pencarian ini.</p>
      ) : (
        <ul className="habit-list" aria-label="Daftar habit hari ini" key={typeFilter}>
          {visibleHabits.map((habit) => {
            const doneLabel = habit.type === "NEGATIVE" ? "Hari bersih" : "Selesai";
            const streak = streakDetails[habit.id];
            const weekly = weeklyStreaks[habit.id];
            return (
              <li className="habit-card" key={habit.id}>
                <button
                  className="habit-copy"
                  type="button"
                  aria-expanded={expandedStreakId === habit.id || expandedWeeklyId === habit.id}
                  aria-busy={detailsPreparingIds.has(habit.id)}
                  aria-controls={`streak-details-${habit.id} weekly-details-${habit.id}`}
                  aria-label={detailsPreparingIds.has(habit.id)
                    ? `Menyiapkan streak dan kalender mingguan: ${habit.title}`
                    : `${expandedStreakId === habit.id || expandedWeeklyId === habit.id ? "Sembunyikan" : "Tampilkan"} streak dan kalender mingguan: ${habit.title}`}
                  onClick={() => void toggleHabitDetails(habit.id)}
                >
                  <span className="habit-copy-title">{habit.title}</span>
                  <span className="habit-copy-description">
                    {habit.type === "NEGATIVE" ? "Menghentikan kebiasaan" : "Membangun kebiasaan"}
                  </span>
                  <span className="habit-copy-hint" aria-hidden="true">
                    {detailsPreparingIds.has(habit.id)
                      ? "Menyiapkan detail…"
                      : expandedStreakId === habit.id ? "Sembunyikan ringkasan" : "Streak & minggu"}
                  </span>
                </button>
                <div className="habit-actions">
                  <span
                    className={habit.checkedIn ? "habit-status is-done" : "habit-status is-pending"}
                  >
                    <span aria-hidden="true">{habit.checkedIn ? "✓" : "○"}</span>
                    {habit.checkedIn ? doneLabel : "Belum ditandai"}
                  </span>
                  <div className="habit-icon-actions" role="group" aria-label={`Aksi untuk ${habit.title}`}>
                    <button
                      className={habit.checkedIn ? "check-in-button icon-action is-undo" : "check-in-button icon-action"}
                      type="button"
                      onClick={() => void toggleCheckIn(habit)}
                      disabled={pendingHabitIds.has(habit.id)}
                      aria-label={pendingHabitIds.has(habit.id)
                        ? `Menyimpan check-in: ${habit.title}`
                        : habit.checkedIn
                          ? `Batalkan check-in: ${habit.title}`
                          : `Tandai ${doneLabel.toLowerCase()}: ${habit.title}`}
                      title={pendingHabitIds.has(habit.id) ? "Menyimpan…" : habit.checkedIn ? "Batalkan check-in" : doneLabel}
                    >
                      {pendingHabitIds.has(habit.id) ? (
                        <span className="action-pending" aria-hidden="true">…</span>
                      ) : habit.checkedIn ? (
                        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2" /></svg>
                      ) : (
                        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
                      )}
                    </button>
                    <button
                      className={editingHabitId === habit.id ? "goal-secondary icon-action is-editing" : "goal-secondary icon-action"}
                      type="button"
                      onClick={() => startEditHabit(habit)}
                      disabled={editHabitPending}
                      aria-expanded={editingHabitId === habit.id}
                      aria-controls={editingHabitId === habit.id ? `edit-habit-form-${habit.id}` : undefined}
                      aria-label={`${editingHabitId === habit.id ? "Tutup editor habit" : "Edit habit"}: ${habit.title}`}
                      title={editingHabitId === habit.id ? "Tutup editor" : "Edit habit"}
                    >
                      {editingHabitId === habit.id ? (
                        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
                      ) : (
                        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5ZM13.8 6.7l3.5 3.5" /></svg>
                      )}
                    </button>
                    <button
                      className="habit-delete-button icon-action"
                      type="button"
                      onClick={() => void openDeleteDialog(habit)}
                      aria-label={`Hapus habit: ${habit.title}`}
                      title="Hapus habit"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>
                    </button>
                  </div>
                </div>
                <section className="streak-section" hidden={expandedStreakId !== habit.id}>
                  <section
                    id={`streak-details-${habit.id}`}
                    className="streak-details"
                    aria-label={`Detail streak ${habit.title}`}
                  >
                    {streakLoadingIds.has(habit.id) ? (
                      <p className="loading-inline" role="status">Memuat detail streak…</p>
                    ) : streakErrors[habit.id] !== undefined ? (
                      <p className="error-message" role="alert">
                        {streakErrors[habit.id]}
                      </p>
                    ) : streak !== undefined ? (
                      <dl>
                        <div>
                          <dt>Streak saat ini</dt>
                          <dd>{streak.current} hari</dd>
                        </div>
                        <div>
                          <dt>Streak terpanjang</dt>
                          <dd>{streak.longest} hari</dd>
                        </div>
                        <div>
                          <dt>Terakhir check-in</dt>
                          <dd>{formatDate(streak.lastDoneDate)}</dd>
                        </div>
                      </dl>
                    ) : null}
                  </section>
                </section>
                <section className="weekly-section" aria-label={`Kalender mingguan ${habit.title}`} hidden={expandedWeeklyId !== habit.id}>
                  <div
                    id={`weekly-details-${habit.id}`}
                    className="weekly-details-content"
                    key={weekly?.weekStart ?? "loading"}
                    aria-busy={weeklyLoadingIds.has(habit.id)}
                  >
                  <h3>Streak mingguan</h3>
                  {weekly === undefined && weeklyLoadingIds.has(habit.id) ? (
                    <p className="loading-message weekly-initial-loading" role="status">Memuat minggu…</p>
                  ) : null}
                  {weeklyErrors[habit.id] !== undefined ? (
                    <p className="error-message" role="alert">{weeklyErrors[habit.id]}</p>
                  ) : null}
                  {weekly !== undefined ? (
                    <>
                      <p className="weekly-summary">
                        Done {weekly.done}/7 · Miss {weekly.miss} · Sisa toleransi {weekly.remaining}
                      </p>
                      <p className="weekly-range">{formatDate(weekly.weekStart)} – {formatDate(weekly.weekEnd)}</p>
                      <div className="weekly-navigation">
                        {weeklyLoadingIds.has(habit.id) ? (
                          <span className="weekly-update-indicator" role="status">Memperbarui…</span>
                        ) : null}
                        <button
                          className="weekly-nav-button"
                          type="button"
                          onClick={() => void loadAdjacentWeek(habit.id, weekly.weekStart, "previous")}
                          disabled={weeklyLoadingIds.has(habit.id)}
                          aria-label={`Lihat minggu sebelumnya untuk ${habit.title}`}
                          title="Minggu sebelumnya"
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
                        </button>
                        <button
                          className="weekly-nav-button"
                          type="button"
                          onClick={() => void loadAdjacentWeek(habit.id, weekly.weekStart, "next")}
                          disabled={weeklyLoadingIds.has(habit.id)}
                          aria-label={`Lihat minggu selanjutnya untuk ${habit.title}`}
                          title="Minggu selanjutnya"
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg>
                        </button>
                      </div>
                      <ol className="weekly-days" aria-label="Senin sampai Minggu">
                        {weekly.days.map((day) => (
                          <li
                            className={`weekly-day is-${day.status.toLowerCase()}`}
                            key={day.date}
                            aria-label={`${formatWeekDay(day.date)}: ${day.status === "DONE" ? "Selesai" : day.status === "MISS" ? "Terlewat" : day.status === "PENDING" ? "Belum ditandai" : "Mendatang"}`}
                          >
                            <span aria-hidden="true">{formatWeekdayAbbreviation(day.date)}</span>
                            <time aria-hidden="true" dateTime={day.date}>{formatDayOfMonth(day.date)}</time>
                            <strong aria-hidden="true">{day.status === "DONE" ? "✓" : day.status === "MISS" ? "–" : day.status === "PENDING" ? "○" : "·"}</strong>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : null}
                  </div>
                </section>
                {editingHabitId === habit.id ? (
                    <form id={`edit-habit-form-${habit.id}`} className="habit-edit-form" onSubmit={(event) => void saveHabitEdit(event, habit)}>
                      <label htmlFor={`edit-habit-title-${habit.id}`}>Nama habit</label>
                      <input id={`edit-habit-title-${habit.id}`} required maxLength={120} value={editHabitTitle}
                        onChange={(event) => setEditHabitTitle(event.target.value)} />
                      <label htmlFor={`edit-habit-description-${habit.id}`}>Deskripsi <span className="optional">(opsional)</span></label>
                      <textarea id={`edit-habit-description-${habit.id}`} maxLength={500} value={editHabitDescription}
                        onChange={(event) => setEditHabitDescription(event.target.value)} />
                      {editHabitError ? <p className="error-message" role="alert">{editHabitError}</p> : null}
                      <div className="habit-edit-actions">
                        <button type="submit" disabled={editHabitPending}>{editHabitPending ? "Menyimpan…" : "Simpan perubahan"}</button>
                        <button type="button" className="goal-secondary" disabled={editHabitPending} onClick={() => setEditingHabitId(null)}>Batal</button>
                      </div>
                    </form>
                  ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <div className="action-messages" aria-live="polite" aria-atomic="true">
        {actionError && (
          <p className="error-message" role="alert">
            {actionError}
          </p>
        )}
        {announcement && (
          <p className="success-message" role="status">
            {announcement}
          </p>
        )}
      </div>
      <dialog
        className="habit-delete-dialog"
        ref={deleteDialogRef}
        aria-labelledby="delete-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDeleteDialog();
        }}
        onClose={() => {
          if (deletingHabit !== null && !deletePending) setDeletingHabit(null);
        }}
      >
        <h2 id="delete-dialog-title">Hapus habit?</h2>
        {deletingHabit ? <p>“{deletingHabit.title}” dan seluruh check-in terkait akan dihapus.</p> : null}
        {replacementLoading ? (
          <div className="replacement-loading-state">
            <p role="status">Memeriksa goal yang terkait…</p>
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </div>
        ) : affectedGoals.length > 0 ? (
          <fieldset className="replacement-picker">
            <legend>Goal berikut memerlukan habit pengganti</legend>
            {affectedGoals.map((goal) => {
              const replacementOptions = habits.filter((item) => item.id !== deletingHabit?.id);
              const selectedReplacement = replacementByGoal[goal.id] ?? "";
              const useNewReplacement = selectedReplacement === "__new__";
              const useSearchPicker = replacementOptions.length > 8;
              const labelId = `replacement-label-${goal.id}`;
              return (
                <div className="replacement-goal-field" key={goal.id}>
                  <span className="replacement-goal-name" id={labelId}>{goal.title}</span>
                  {useSearchPicker ? (
                    <Popover
                      open={replacementPickerOpen[goal.id] ?? false}
                      onOpenChange={(open) => setReplacementPickerOpen((current) => ({ ...current, [goal.id]: open }))}
                    >
                      <PopoverTrigger asChild>
                        <button
                          className="replacement-combobox-trigger"
                          type="button"
                          role="combobox"
                          aria-label={`Habit pengganti untuk ${goal.title}: ${replacementOptions.find((item) => item.id === selectedReplacement)?.title ?? (useNewReplacement ? "habit baru dipilih" : "belum dipilih")}`}
                          aria-required="true"
                          aria-expanded={replacementPickerOpen[goal.id] ?? false}
                          aria-haspopup="listbox"
                          disabled={deletePending}
                        >
                          <span className="replacement-trigger-value">
                            {selectedReplacement === "__new__"
                              ? "Buat habit baru untuk pengganti"
                              : replacementOptions.find((item) => item.id === selectedReplacement)?.title ?? "Pilih habit pengganti"}
                          </span>
                          <ChevronsUpDown aria-hidden="true" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="replacement-combobox-content"
                        align="start"
                        sideOffset={5}
                        portalContainer={deleteDialogRef.current}
                      >
                        <Command className="replacement-command">
                          <CommandInput aria-label={`Cari habit pengganti untuk ${goal.title}`} placeholder="Cari habit…" />
                          <CommandList>
                            <CommandEmpty>Habit tidak ditemukan.</CommandEmpty>
                            <CommandGroup>
                              {replacementOptions.map((item) => (
                                <CommandItem
                                  key={item.id}
                                  value={`${item.title} ${item.id}`}
                                  onSelect={() => {
                                    setReplacementByGoal((current) => ({ ...current, [goal.id]: item.id }));
                                    setReplacementPickerOpen((current) => ({ ...current, [goal.id]: false }));
                                    setDeleteError("");
                                  }}
                                >
                                  <Check
                                    aria-hidden="true"
                                    className={cn("replacement-check", selectedReplacement === item.id && "is-selected")}
                                  />
                                  <span>{item.title}</span>
                                  <span className="replacement-type">{item.type === "POSITIVE" ? "Positif" : "Negatif"}</span>
                                  </CommandItem>
                              ))}
                              <CommandItem
                                value="__new__"
                                onSelect={() => {
                                  setReplacementByGoal((current) => ({ ...current, [goal.id]: "__new__" }));
                                  setReplacementPickerOpen((current) => ({ ...current, [goal.id]: false }));
                                  setDeleteError("");
                                }}
                              >
                                <Check aria-hidden="true" className={cn("replacement-check", useNewReplacement && "is-selected")} />
                                <span>Buat habit baru untuk pengganti</span>
                              </CommandItem>
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Select
                      value={selectedReplacement}
                      onValueChange={(value) => {
                        setReplacementByGoal((current) => ({ ...current, [goal.id]: value }));
                        setDeleteError("");
                      }}
                      disabled={deletePending}
                    >
                      <SelectTrigger
                        className="replacement-select-trigger"
                        aria-label={`Habit pengganti untuk ${goal.title}`}
                        aria-required="true"
                      >
                        <SelectValue placeholder="Pilih habit pengganti" />
                      </SelectTrigger>
                      <SelectContent
                        className="replacement-select-content"
                        position="popper"
                        align="start"
                        portalContainer={deleteDialogRef.current}
                      >
                        {replacementOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            <span className="replacement-select-item">
                              {item.title}
                              <span className="replacement-type">{item.type === "POSITIVE" ? "Positif" : "Negatif"}</span>
                            </span>
                          </SelectItem>
                        ))}
                        <SelectItem value="__new__">Buat habit baru untuk pengganti</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}
            {Object.values(replacementByGoal).includes("__new__") ? (
              <div className="replacement-new-habit">
                <label>Nama habit baru<input required maxLength={120} value={replacementNewTitle} onChange={(event) => setReplacementNewTitle(event.target.value)} /></label>
                <div className="replacement-picker-field">
                  <span className="habit-type-label">Jenis habit</span>
                  <HabitTypeToggle value={replacementNewType} onValueChange={setReplacementNewType} ariaLabel="Jenis habit pengganti baru" />
                </div>
                <label>Deskripsi (opsional)<textarea maxLength={500} value={replacementNewDescription} onChange={(event) => setReplacementNewDescription(event.target.value)} /></label>
                <p>Habit baru akan dibuat dan dipasang ke semua goal yang memilih opsi ini, sebagai bagian dari penghapusan.</p>
              </div>
            ) : null}
          </fieldset>
        ) : !replacementLoading && !deleteError ? (
          <p>Goal lain tidak akan berubah.</p>
        ) : null}
        {deleteError ? <p className="error-message" role="alert">{deleteError}</p> : null}
        <div className="dialog-actions">
          <button className="goal-secondary" type="button" onClick={closeDeleteDialog} disabled={deletePending}>Batal</button>
          <button className="goal-delete" type="button" onClick={() => void confirmDeleteHabit()} disabled={deletePending || replacementLoading || Boolean(deleteError && affectedGoals.length === 0)}>
            {deletePending ? "Menghapus…" : "Hapus habit"}
          </button>
        </div>
      </dialog>
    </main>
  );
}
