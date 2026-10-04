"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import HabitTypeToggle from "@/components/habit-type-toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAuthSession, setAuthSession, type AuthUser } from "./auth/auth-session";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  habitCount: number;
  habitLinks: Array<{ habit: { id: string; title: string; type: "POSITIVE" | "NEGATIVE" } }>;
  progress: GoalProgress;
};
type GoalProgress = {
  weeklyCompletionPct: number;
  perHabit: Array<{ habitId: string; done: number; miss: number }>;
};

type GoalForm = { title: string; description: string; deadline: string };
type HabitOption = { id: string; title: string; type: "POSITIVE" | "NEGATIVE" };
type NewHabitForm = { title: string; type: "POSITIVE" | "NEGATIVE"; description: string };
type SessionResponse = { accessToken: string; user: AuthUser };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSessionResponse(value: unknown): value is SessionResponse {
  if (!isRecord(value) || typeof value["accessToken"] !== "string") return false;
  const user = value["user"];
  return isRecord(user) && typeof user["id"] === "string" && typeof user["email"] === "string" &&
    (typeof user["name"] === "string" || user["name"] === null);
}

function isGoalList(value: unknown): value is { goals: Goal[] } {
  if (!isRecord(value) || !Array.isArray(value["goals"])) return false;
  return value["goals"].every((item: unknown) => {
    if (!isRecord(item) || typeof item["id"] !== "string" || typeof item["title"] !== "string" ||
      (typeof item["description"] !== "string" && item["description"] !== null) ||
      (typeof item["deadline"] !== "string" && item["deadline"] !== null) ||
      typeof item["habitCount"] !== "number" || !Array.isArray(item["habitLinks"]) ||
      !isRecord(item["progress"])) return false;
    const progress = item["progress"];
    return typeof progress["weeklyCompletionPct"] === "number" &&
      Array.isArray(progress["perHabit"]) &&
      progress["perHabit"].every((habit: unknown) => isRecord(habit) &&
        typeof habit["habitId"] === "string" && typeof habit["done"] === "number" &&
        typeof habit["miss"] === "number") &&
      item["habitLinks"].every((link: unknown) => isRecord(link) && isRecord(link["habit"]) &&
        typeof link["habit"]["id"] === "string" && typeof link["habit"]["title"] === "string" &&
        (link["habit"]["type"] === "POSITIVE" || link["habit"]["type"] === "NEGATIVE"));
  });
}

function isHabitList(value: unknown): value is { habits: HabitOption[] } {
  if (!isRecord(value) || !Array.isArray(value["habits"])) return false;
  return value["habits"].every((item: unknown) => isRecord(item) &&
    typeof item["id"] === "string" && typeof item["title"] === "string" &&
    (item["type"] === "POSITIVE" || item["type"] === "NEGATIVE"));
}

async function refreshToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/v1/auth/refresh", { method: "POST", cache: "no-store" });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!isSessionResponse(body)) return null;
    setAuthSession(body.accessToken, body.user);
    return body.accessToken;
  } catch {
    return null;
  }
}

export default function GoalsPanel(): JSX.Element {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [habits, setHabits] = useState<HabitOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingUnassignIds, setPendingUnassignIds] = useState<string[]>([]);
  const [pendingAssignIds, setPendingAssignIds] = useState<string[]>([]);
  const [lastHabitAttempt, setLastHabitAttempt] = useState<{ goalId: string; tick: number } | null>(null);
  const [editHabitPickerValue, setEditHabitPickerValue] = useState("");
  const [showEditNewHabit, setShowEditNewHabit] = useState(false);
  const [editNewHabit, setEditNewHabit] = useState<NewHabitForm>({ title: "", type: "POSITIVE", description: "" });
  const [editNewHabitStaged, setEditNewHabitStaged] = useState(false);
  const [editHabitError, setEditHabitError] = useState("");
  const [form, setForm] = useState<GoalForm>({ title: "", description: "", deadline: "" });
  const [pending, setPending] = useState(false);
  const [createForm, setCreateForm] = useState<GoalForm>({ title: "", description: "", deadline: "" });
  const [selectedHabitIds, setSelectedHabitIds] = useState<string[]>([]);
  const [habitPickerValue, setHabitPickerValue] = useState("");
  const [showInlineHabit, setShowInlineHabit] = useState(false);
  const [newHabit, setNewHabit] = useState<NewHabitForm>({ title: "", type: "POSITIVE", description: "" });
  const [createError, setCreateError] = useState("");
  const [habitsLoading, setHabitsLoading] = useState(true);
  const [deletingGoal, setDeletingGoal] = useState<Goal | null>(null);
  const goalDeleteDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = goalDeleteDialogRef.current;
    if (deletingGoal !== null && dialog !== null && !dialog.open) dialog.showModal();
    if (deletingGoal === null && dialog?.open) dialog.close();
  }, [deletingGoal]);

  const request = useCallback(async (path: string, init: RequestInit = {}): Promise<Response | null> => {
    let token = getAuthSession().accessToken;
    if (token === null) token = await refreshToken();
    if (token === null) return null;
    const send = (value: string): Promise<Response> => {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${value}`);
      return fetch(path, { ...init, headers, cache: "no-store" });
    };
    let response = await send(token);
    if (response.status === 401) {
      token = await refreshToken();
      if (token === null) return null;
      response = await send(token);
    }
    return response;
  }, []);

  const loadGoals = useCallback(async (showLoading = true): Promise<boolean> => {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const response = await request("/api/v1/goals");
      if (response === null || response.status === 401) {
        setAuthSession(null, null);
        router.replace("/auth");
        return false;
      }
      const body: unknown = await response.json();
      if (!response.ok || !isGoalList(body)) {
        if (showLoading) setLoadError("Daftar goal belum dapat dimuat. Silakan coba lagi.");
        else setMessage("Relasi diperbarui, tetapi daftar goal gagal disegarkan.");
        return false;
      }
      setGoals(body.goals);
      return true;
    } catch {
      if (showLoading) setLoadError("Tidak dapat menghubungi layanan. Silakan coba lagi.");
      else setMessage("Relasi diperbarui, tetapi daftar goal gagal disegarkan.");
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [request, router]);

  useEffect(() => { void loadGoals(); }, [loadGoals]);

  useEffect(() => {
    let active = true;
    async function loadHabits(): Promise<void> {
      try {
        const response = await request("/api/v1/habits");
        if (response === null || response.status === 401) {
          setAuthSession(null, null);
          router.replace("/auth");
          return;
        }
        const body: unknown = await response.json();
        if (!response.ok || !isHabitList(body)) {
          if (active) setCreateError("Daftar habit belum dapat dimuat. Silakan coba lagi.");
          return;
        }
        if (active) setHabits(body.habits);
      } catch {
        if (active) setCreateError("Tidak dapat memuat pilihan habit. Silakan coba lagi.");
      } finally {
        if (active) setHabitsLoading(false);
      }
    }
    void loadHabits();
    return () => { active = false; };
  }, [request, router]);

  function selectCreateHabit(habitId: string): void {
    if (habitId === "__new__") {
      setHabitPickerValue("");
      setShowInlineHabit(true);
      setCreateError("");
      return;
    }
    if (showInlineHabit && newHabit.title.trim() === "") {
      setShowInlineHabit(false);
      setNewHabit({ title: "", type: "POSITIVE", description: "" });
    }
    setSelectedHabitIds((current) => current.includes(habitId) ? current : [...current, habitId]);
    setHabitPickerValue("");
  }

  function removeCreateHabit(habitId: string): void {
    setSelectedHabitIds((current) => current.filter((id) => id !== habitId));
  }

  function cancelCreateGoal(): void {
    if (pending) return;
    setCreateFormOpen(false);
    setCreateForm({ title: "", description: "", deadline: "" });
    setSelectedHabitIds([]);
    setHabitPickerValue("");
    setShowInlineHabit(false);
    setNewHabit({ title: "", type: "POSITIVE", description: "" });
    setCreateError("");
  }

  async function createGoal(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const inlineTitle = newHabit.title.trim();
    if (selectedHabitIds.length === 0 && (!showInlineHabit || inlineTitle.length === 0)) {
      setCreateError("Pilih minimal satu habit atau buat habit baru secara inline.");
      return;
    }
    setPending(true);
    setCreateError("");
    setMessage("");
    try {
      const response = await request("/api/v1/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: createForm.title,
          description: createForm.description || undefined,
          deadline: createForm.deadline || undefined,
          habitIds: selectedHabitIds,
          newHabits: showInlineHabit && inlineTitle.length > 0 ? [{
            title: inlineTitle,
            type: newHabit.type,
            ...(newHabit.description ? { description: newHabit.description } : {}),
          }] : [],
        }),
      });
      if (response === null || response.status === 401) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        let errorMessage = "Goal gagal dibuat. Periksa isian dan coba lagi.";
        try {
          const body: unknown = await response.json();
          if (isRecord(body) && isRecord(body["error"]) && typeof body["error"]["message"] === "string") {
            errorMessage = body["error"]["message"];
          }
        } catch {
          // Keep the readable fallback for responses without JSON.
        }
        setCreateError(errorMessage);
        return;
      }
      setCreateForm({ title: "", description: "", deadline: "" });
      setSelectedHabitIds([]);
      setHabitPickerValue("");
      setShowInlineHabit(false);
      setNewHabit({ title: "", type: "POSITIVE", description: "" });
      setCreateFormOpen(false);
      setMessage("Goal berhasil dibuat.");
      await Promise.all([loadGoals(), refreshHabitOptions()]);
    } catch {
      setCreateError("Tidak dapat menghubungi layanan. Silakan coba lagi.");
    } finally {
      setPending(false);
    }
  }

  async function refreshHabitOptions(): Promise<void> {
    const response = await request("/api/v1/habits");
    if (response === null || !response.ok) return;
    const body: unknown = await response.json();
    if (isHabitList(body)) setHabits(body.habits);
  }

  function startEdit(goal: Goal): void {
    if (editingId === goal.id) {
      cancelGoalEdit();
      return;
    }
    setEditingId(goal.id);
    setPendingUnassignIds([]);
    setPendingAssignIds([]);
    setLastHabitAttempt(null);
    setEditHabitPickerValue("");
    setShowEditNewHabit(false);
    setEditNewHabit({ title: "", type: "POSITIVE", description: "" });
    setEditNewHabitStaged(false);
    setEditHabitError("");
    setForm({
      title: goal.title,
      description: goal.description ?? "",
      deadline: goal.deadline?.slice(0, 10) ?? "",
    });
    setMessage("");
  }

  function cancelGoalEdit(): void {
    if (pending) return;
    setEditingId(null);
    setPendingUnassignIds([]);
    setPendingAssignIds([]);
    setLastHabitAttempt(null);
    setEditNewHabitStaged(false);
    setEditHabitError("");
  }

  function stageNewHabitForGoal(): void {
    if (pending) return;
    const title = editNewHabit.title.trim();
    if (!title) {
      setEditHabitError("Nama habit wajib diisi.");
      return;
    }
    setEditHabitError("");
    setEditNewHabitStaged(true);
  }

  function handleEditHabitSelection(goal: Goal, value: string): void {
    setEditHabitPickerValue("");
    if (value === "__new__") {
      setShowEditNewHabit(true);
      setEditNewHabitStaged(false);
      setEditHabitError("");
      return;
    }
    setShowEditNewHabit(editNewHabitStaged || editNewHabit.title.trim().length > 0);
    if (pendingUnassignIds.includes(value)) {
      setPendingUnassignIds((current) => current.filter((id) => id !== value));
      setLastHabitAttempt(null);
      return;
    }
    if (!goal.habitLinks.some((link) => link.habit.id === value) && !pendingAssignIds.includes(value)) {
      setPendingAssignIds((current) => [...current, value]);
    }
    setLastHabitAttempt(null);
    setEditHabitError("");
  }

  function closeEditNewHabitForm(): void {
    setShowEditNewHabit(false);
    setEditNewHabitStaged(false);
    setEditNewHabit({ title: "", type: "POSITIVE", description: "" });
    setEditHabitError("");
  }

  function stageHabitUnassignment(goal: Goal, habitId: string): void {
    if (pending || pendingUnassignIds.includes(habitId)) return;
    const remainingCount = goal.habitLinks.filter((link) => !pendingUnassignIds.includes(link.habit.id)).length + pendingAssignIds.length + Number(editNewHabitStaged);
    if (remainingCount <= 1) {
      setLastHabitAttempt((current) => ({ goalId: goal.id, tick: (current?.tick ?? 0) + 1 }));
      return;
    }
    setPendingUnassignIds((current) => [...current, habitId]);
    setPendingAssignIds((current) => current.filter((id) => id !== habitId));
    setLastHabitAttempt(null);
    setMessage("");
  }

  async function saveEdit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (editingId === null || pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await request(`/api/v1/goals/${encodeURIComponent(editingId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          deadline: form.deadline || null,
          addHabitIds: pendingAssignIds,
          removeHabitIds: pendingUnassignIds,
          newHabits: editNewHabitStaged ? [{
            title: editNewHabit.title.trim(),
            type: editNewHabit.type,
            ...(editNewHabit.description.trim() ? { description: editNewHabit.description.trim() } : {}),
          }] : [],
        }),
      });
      if (response === null || response.status === 401) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        let errorMessage = "Perubahan goal gagal disimpan. Periksa isian dan coba lagi.";
        try {
          const body: unknown = await response.json();
          if (isRecord(body) && isRecord(body["error"]) && typeof body["error"]["message"] === "string") {
            errorMessage = body["error"]["message"];
          }
        } catch {
          // Keep the readable fallback for responses without JSON.
        }
        setMessage(errorMessage);
        return;
      }
      if (editNewHabitStaged) {
        const newHabitResponse: unknown = await response.clone().json().catch(() => null);
        if (isRecord(newHabitResponse) && Array.isArray(newHabitResponse["createdHabitIds"])) {
          for (const createdHabitId of newHabitResponse["createdHabitIds"]) {
            if (typeof createdHabitId !== "string") continue;
            const createdHabit: HabitOption = { id: createdHabitId, title: editNewHabit.title.trim(), type: editNewHabit.type };
            try {
              window.sessionStorage.setItem("habit-shaper:pending-created-habit", JSON.stringify({ ...createdHabit, checkedIn: false }));
            } catch {
              // The habit page still receives the live event when it remains mounted.
            }
            window.dispatchEvent(new CustomEvent("habit-shaper:habit-created", { detail: { ...createdHabit, checkedIn: false } }));
          }
        }
      }
      setEditingId(null);
      setPendingUnassignIds([]);
      setPendingAssignIds([]);
      setEditNewHabitStaged(false);
      setShowEditNewHabit(false);
      setMessage(pendingUnassignIds.length > 0 || pendingAssignIds.length > 0 || editNewHabitStaged
        ? "Goal dan habit yang terhubung berhasil diperbarui."
        : "Goal berhasil diperbarui.");
      await Promise.all([loadGoals(), refreshHabitOptions()]);
    } catch {
      setMessage("Tidak dapat menghubungi layanan. Silakan coba lagi.");
      await loadGoals(false);
    } finally {
      setPending(false);
    }
  }

  function openDeleteGoalDialog(goal: Goal): void {
    setDeletingGoal(goal);
  }

  function closeDeleteGoalDialog(): void {
    if (pending) return;
    setDeletingGoal(null);
  }

  async function confirmDeleteGoal(): Promise<void> {
    const goal = deletingGoal;
    if (goal === null || pending) return;
    setPending(true);
    setMessage("");
    try {
      const response = await request(`/api/v1/goals/${encodeURIComponent(goal.id)}`, { method: "DELETE" });
      if (response === null || response.status === 401) {
        router.replace("/auth");
        return;
      }
      if (!response.ok) {
        setMessage("Goal gagal dihapus. Silakan coba lagi.");
        return;
      }
      setGoals((current) => current.filter((item) => item.id !== goal.id));
      if (editingId === goal.id) setEditingId(null);
      setDeletingGoal(null);
      setMessage("Goal dihapus. Streak dan check-in habit tetap utuh.");
    } catch {
      setMessage("Tidak dapat menghubungi layanan. Silakan coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="goals-section" aria-labelledby="goals-title">
      <div className="goals-heading">
        <div>
          <p className="eyebrow">TUJUAN</p>
          <h2 id="goals-title">Daftar goal</h2>
        </div>
        <button
          className="goal-primary goal-create-toggle icon-action"
          type="button"
          aria-label={createFormOpen ? "Tutup form goal" : "Buat goal"}
          title={createFormOpen ? "Tutup form goal" : "Buat goal"}
          aria-expanded={createFormOpen}
          aria-controls="create-goal-form"
          onClick={() => setCreateFormOpen((current) => !current)}
        >
          {createFormOpen ? (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
          )}
        </button>
      </div>
      <form
        id="create-goal-form"
        className="goal-form goal-create-form"
        hidden={!createFormOpen}
        onSubmit={(event) => void createGoal(event)}
      >
        <h3>Goal baru</h3>
        <div className="goal-field">
          <label htmlFor="new-goal-title">Nama goal</label>
          <input id="new-goal-title" required maxLength={120} value={createForm.title}
            onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} />
        </div>
        <div className="goal-field">
          <label htmlFor="new-goal-description">Deskripsi <span className="optional">(opsional)</span></label>
          <textarea id="new-goal-description" maxLength={500} value={createForm.description}
            onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} />
        </div>
        <div className="goal-field">
          <label htmlFor="new-goal-deadline">Tenggat <span className="optional">(opsional)</span></label>
          <input id="new-goal-deadline" type="date" value={createForm.deadline}
            onChange={(event) => setCreateForm((current) => ({ ...current, deadline: event.target.value }))} />
        </div>
        <fieldset className="habit-picker">
          <legend>Pilih habit (minimal satu)</legend>
          {habitsLoading ? <p className="loading-message" role="status">Memuat pilihan habit…</p> : (
            <>
              {selectedHabitIds.length > 0 ? (
                <ul className="selected-habit-list" aria-label="Habit terpilih">
                  {selectedHabitIds.map((habitId) => {
                    const habit = habits.find((item) => item.id === habitId);
                    if (!habit) return null;
                    return (
                      <li className="selected-habit-item" key={habit.id}>
                        <span>
                          {habit.title} <span className="optional">({habit.type === "POSITIVE" ? "Membangun" : "Menghentikan"})</span>
                        </span>
                        <button
                          className="remove-selected-habit"
                          type="button"
                          aria-label={`Hapus ${habit.title} dari pilihan`}
                          title={`Hapus ${habit.title}`}
                          onClick={() => removeCreateHabit(habit.id)}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <div className="goal-field">
                <label id="create-habit-picker-label" htmlFor="create-habit-picker">
                  {selectedHabitIds.length > 0 ? "Tambah habit" : "Pilih habit atau buat yang baru"}
                </label>
                <Select value={habitPickerValue} onValueChange={selectCreateHabit}>
                  <SelectTrigger id="create-habit-picker" className="goal-select-trigger" aria-labelledby="create-habit-picker-label">
                    <SelectValue placeholder="Pilih habit…" />
                  </SelectTrigger>
                  <SelectContent className="goal-select-content" position="popper" align="start">
                    {habits.filter((habit) => !selectedHabitIds.includes(habit.id)).map((habit) => (
                      <SelectItem key={habit.id} value={habit.id}>
                        {habit.title} ({habit.type === "POSITIVE" ? "Membangun" : "Menghentikan"})
                      </SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Buat habit baru…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {habits.length > 0 && selectedHabitIds.length === habits.length ? (
                <p className="habit-picker-complete">Semua habit sudah dipilih.</p>
              ) : null}
              {showInlineHabit ? (
                <div className="goal-inline-habit-form" id="inline-habit-fields">
                  <div className="inline-habit-heading">
                    <strong>Habit baru</strong>
                    <button className="remove-selected-habit" type="button" aria-label="Tutup form habit baru"
                      onClick={() => setShowInlineHabit(false)}><X aria-hidden="true" /></button>
                  </div>
                  <label htmlFor="inline-habit-title">Nama habit</label>
                  <input id="inline-habit-title" required={selectedHabitIds.length === 0} maxLength={120} value={newHabit.title}
                    onChange={(event) => setNewHabit((current) => ({ ...current, title: event.target.value }))} />
                  <span className="habit-type-label">Jenis habit</span>
                  <HabitTypeToggle value={newHabit.type}
                    onValueChange={(type) => setNewHabit((current) => ({ ...current, type }))} />
                  <label htmlFor="inline-habit-description">Deskripsi <span className="optional">(opsional)</span></label>
                  <textarea id="inline-habit-description" maxLength={500} value={newHabit.description}
                    onChange={(event) => setNewHabit((current) => ({ ...current, description: event.target.value }))} />
                </div>
              ) : null}
            </>
          )}
        </fieldset>
        {createError ? <p className="error-message" role="alert">{createError}</p> : null}
        <div className="goal-actions">
          <button className="goal-primary" type="submit" disabled={pending || habitsLoading}>
            {pending ? "Menyimpan…" : "Simpan goal"}
          </button>
          <button className="goal-secondary" type="button" onClick={cancelCreateGoal} disabled={pending}>
            Batal
          </button>
        </div>
      </form>
      {loading ? <p className="loading-message" role="status">Memuat goals…</p> : loadError ? (
        <p className="error-message" role="alert">{loadError}</p>
      ) : goals.length === 0 ? (
        <p className="goals-empty">Belum ada goal.</p>
      ) : (
        <ul className="goal-list" aria-label="Daftar goals">
          {goals.map((goal) => {
            const remainingDraftCount = goal.habitLinks.filter((link) => !pendingUnassignIds.includes(link.habit.id)).length;
            const draftHabitCount = remainingDraftCount + pendingAssignIds.length + Number(editNewHabitStaged);
            const showLastHabitWarning = lastHabitAttempt?.goalId === goal.id;
            return (
            <li className="goal-card" key={goal.id}>
              {editingId === goal.id ? (
                <form className="goal-form" onSubmit={(event) => void saveEdit(event)}>
                  <div className="goal-field">
                    <label htmlFor={`goal-title-${goal.id}`}>Nama goal</label>
                    <input id={`goal-title-${goal.id}`} required maxLength={120} value={form.title}
                      onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                  </div>
                  <div className="goal-field">
                    <label htmlFor={`goal-description-${goal.id}`}>Deskripsi <span className="optional">(opsional)</span></label>
                    <textarea id={`goal-description-${goal.id}`} maxLength={500} value={form.description}
                      onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                  <div className="goal-field">
                    <label htmlFor={`goal-deadline-${goal.id}`}>Tenggat <span className="optional">(opsional)</span></label>
                    <input id={`goal-deadline-${goal.id}`} type="date" value={form.deadline}
                      onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))} />
                  </div>
                  <fieldset className="goal-habit-editor">
                    <legend>Habit yang terhubung</legend>
                    {draftHabitCount <= 1 ? (
                      <p
                        key={showLastHabitWarning ? lastHabitAttempt?.tick : "goal-habit-hint"}
                        className={showLastHabitWarning ? "goal-editor-hint is-warning is-shaking" : "goal-editor-hint"}
                        id={`goal-last-habit-${goal.id}`}
                        role={showLastHabitWarning ? "alert" : undefined}
                      >
                        Goal wajib memiliki minimal satu habit. Tambahkan habit lain sebelum melepas habit terakhir.
                      </p>
                    ) : null}
                    <ul className="goal-linked-habits">
                      {goal.habitLinks.map(({ habit }) => (
                        <li key={habit.id}>
                          <span>
                            {habit.title} <span className="optional">({habit.type === "POSITIVE" ? "Positif" : "Negatif"})</span>
                          </span>
                          {pendingUnassignIds.includes(habit.id) ? (
                            <span className="pending-unassign" role="status">Akan dilepas</span>
                          ) : (
                            <button
                              className="remove-selected-habit"
                              type="button"
                              onClick={() => stageHabitUnassignment(goal, habit.id)}
                              disabled={pending || draftHabitCount <= 1}
                              aria-label={`Lepas ${habit.title} dari goal ${goal.title}`}
                              aria-describedby={draftHabitCount <= 1 ? `goal-last-habit-${goal.id}` : undefined}
                              title={draftHabitCount <= 1 ? "Goal harus memiliki minimal satu habit" : "Tandai untuk dilepas saat disimpan"}
                            >
                              <X aria-hidden="true" />
                            </button>
                          )}
                        </li>
                      ))}
                      {pendingAssignIds.map((habitId) => {
                        const habit = habits.find((item) => item.id === habitId);
                        if (!habit) return null;
                        return (
                          <li key={habit.id}>
                            <span>
                              {habit.title} <span className="optional">({habit.type === "POSITIVE" ? "Positif" : "Negatif"})</span>
                              <span className="pending-unassign">Akan ditambahkan</span>
                            </span>
                            <button className="remove-selected-habit" type="button" disabled={pending}
                              aria-label={`Batalkan penambahan ${habit.title}`} title="Batalkan penambahan"
                              onClick={() => setPendingAssignIds((current) => current.filter((id) => id !== habit.id))}>
                              <X aria-hidden="true" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {pendingUnassignIds.length > 0 ? (
                      <p className="goal-editor-hint">Habit bertanda “Akan dilepas” hanya dilepas setelah menekan Simpan.</p>
                    ) : null}
                    <div className="goal-assign-control">
                      <label id={`assign-habit-label-${goal.id}`} htmlFor={`assign-habit-${goal.id}`}>Tambah habit</label>
                      {habitsLoading ? <p className="loading-message" role="status">Memuat pilihan habit…</p> : (
                        <Select value={editHabitPickerValue} onValueChange={(value) => handleEditHabitSelection(goal, value)} disabled={pending}>
                          <SelectTrigger id={`assign-habit-${goal.id}`} className="goal-select-trigger" aria-labelledby={`assign-habit-label-${goal.id}`}>
                            <SelectValue placeholder="Pilih habit…" />
                          </SelectTrigger>
                          <SelectContent className="goal-select-content" position="popper" align="start">
                            {habits
                              .filter((habit) => !goal.habitLinks.some((link) => link.habit.id === habit.id && !pendingUnassignIds.includes(habit.id)) && !pendingAssignIds.includes(habit.id))
                              .map((habit) => (
                                <SelectItem value={habit.id} key={habit.id}>{habit.title}</SelectItem>
                              ))}
                            <SelectItem value="__new__">+ Buat habit baru…</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {showEditNewHabit ? (
                      <div className="goal-inline-habit-form">
                        <div className="inline-habit-heading">
                          <strong>Habit baru</strong>
                          <button className="remove-selected-habit" type="button" aria-label="Tutup form habit baru"
                            onClick={closeEditNewHabitForm}><X aria-hidden="true" /></button>
                        </div>
                        <label htmlFor={`edit-new-habit-title-${goal.id}`}>Nama habit baru</label>
                        <input
                          id={`edit-new-habit-title-${goal.id}`}
                          required={editNewHabitStaged}
                          maxLength={120}
                          value={editNewHabit.title}
                          onChange={(event) => setEditNewHabit((current) => ({ ...current, title: event.target.value }))}
                        />
                        <span className="habit-type-label">Jenis habit</span>
                        <HabitTypeToggle value={editNewHabit.type}
                          onValueChange={(type) => setEditNewHabit((current) => ({ ...current, type }))} />
                        <label htmlFor={`edit-new-habit-description-${goal.id}`}>Deskripsi <span className="optional">(opsional)</span></label>
                        <textarea
                          id={`edit-new-habit-description-${goal.id}`}
                          maxLength={500}
                          value={editNewHabit.description}
                          onChange={(event) => setEditNewHabit((current) => ({ ...current, description: event.target.value }))}
                        />
                        <p>Habit akan dibuat dan dihubungkan bersama perubahan goal saat disimpan.</p>
                        <button className="goal-secondary" type="button" onClick={stageNewHabitForGoal} disabled={pending || editNewHabitStaged}>
                          {editNewHabitStaged ? "Akan ditambahkan saat disimpan" : "Tambahkan saat menyimpan"}
                        </button>
                      </div>
                    ) : null}
                    {editHabitError ? <p className="error-message" role="alert">{editHabitError}</p> : null}
                  </fieldset>
                  <div className="goal-actions">
                    <button className="goal-primary" type="submit" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
                    <button className="goal-secondary" type="button" onClick={cancelGoalEdit}>Batal</button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="goal-copy">
                    <h3>{goal.title}</h3>
                    {goal.description ? <p>{goal.description}</p> : null}
                    <p className="goal-meta">{goal.habitCount} habit{goal.deadline ? ` · Tenggat ${goal.deadline.slice(0, 10)}` : ""}</p>
                    <div className="goal-progress">
                      <label htmlFor={`goal-progress-${goal.id}`}>Progres minggu ini: {goal.progress.weeklyCompletionPct}%</label>
                      <progress id={`goal-progress-${goal.id}`} value={goal.progress.weeklyCompletionPct} max={100}>
                        {goal.progress.weeklyCompletionPct}%
                      </progress>
                      <ul className="goal-habit-progress" aria-label={`Progres habit untuk ${goal.title}`}>
                        {goal.progress.perHabit.map((progress) => {
                          const habit = goal.habitLinks.find((link) => link.habit.id === progress.habitId)?.habit;
                          return (
                            <li key={progress.habitId}>
                              {habit?.title ?? "Habit"}: {progress.done} selesai, {progress.miss} terlewat
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                  <div className="goal-actions">
                    <button
                      className="goal-secondary icon-action goal-icon-action"
                      type="button"
                      onClick={() => startEdit(goal)}
                      aria-label={`Edit goal: ${goal.title}`}
                      title="Edit goal"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5ZM13.8 6.7l3.5 3.5" /></svg>
                    </button>
                    <button
                      className="goal-delete icon-action goal-icon-action"
                      type="button"
                      onClick={() => openDeleteGoalDialog(goal)}
                      disabled={pending}
                      aria-label={`Hapus goal: ${goal.title}`}
                      title="Hapus goal"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>
                    </button>
                  </div>
                </>
              )}
            </li>
            );
          })}
        </ul>
      )}
      <div className="goal-message" aria-live="polite" aria-atomic="true">
        {message ? <p className={message.startsWith("Tidak") || message.includes("gagal") ? "error-message" : "success-message"} role="status">{message}</p> : null}
      </div>
      <dialog
        className="goal-delete-dialog"
        ref={goalDeleteDialogRef}
        aria-labelledby="goal-delete-title"
        aria-describedby="goal-delete-description"
        onCancel={(event) => {
          event.preventDefault();
          closeDeleteGoalDialog();
        }}
        onClose={() => {
          if (deletingGoal !== null && !pending) setDeletingGoal(null);
        }}
      >
        <h2 id="goal-delete-title">Hapus goal?</h2>
        <p id="goal-delete-description">
          {deletingGoal ? `Hapus “${deletingGoal.title}”? Habit, streak, dan check-in tetap utuh.` : "Habit, streak, dan check-in tetap utuh."}
        </p>
        <div className="dialog-actions">
          <button className="goal-secondary" type="button" onClick={closeDeleteGoalDialog} disabled={pending}>Batal</button>
          <button className="goal-delete" type="button" onClick={() => void confirmDeleteGoal()} disabled={pending}>
            {pending ? "Menghapus…" : "Hapus goal"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
