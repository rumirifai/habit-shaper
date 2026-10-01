"use client";

import { useEffect, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { getAuthSession, setAuthSession, type AuthUser } from "./auth/auth-session";

type HabitSummary = {
  id: string;
  title: string;
  type: "POSITIVE" | "NEGATIVE";
  checkedIn: boolean;
};

type DailyStreak = {
  habitId: string;
  current: number;
  longest: number;
  lastDoneDate: string | null;
};

type SessionResponse = {
  accessToken: string;
  user: AuthUser;
};

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

export default function Home(): JSX.Element {
  const router = useRouter();
  const [habits, setHabits] = useState<HabitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [pendingHabitIds, setPendingHabitIds] = useState<Set<string>>(() => new Set());
  const [logoutPending, setLogoutPending] = useState(false);
  const [expandedStreakId, setExpandedStreakId] = useState<string | null>(null);
  const [streakDetails, setStreakDetails] = useState<Record<string, DailyStreak>>({});
  const [streakLoadingIds, setStreakLoadingIds] = useState<Set<string>>(() => new Set());
  const [streakErrors, setStreakErrors] = useState<Record<string, string>>({});

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
          setHabits(listBody.habits);
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

  async function logout(): Promise<void> {
    setLogoutPending(true);
    setActionError("");
    try {
      const response = await fetch("/api/v1/auth/logout", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        setActionError("Logout gagal. Silakan coba lagi.");
        return;
      }
      setAuthSession(null, null);
      router.replace("/auth");
    } catch {
      setActionError("Tidak dapat menghubungi layanan. Silakan coba lagi.");
    } finally {
      setLogoutPending(false);
    }
  }

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
      if (expandedStreakId === habit.id) void loadStreakDetails(habit.id);
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

  async function toggleStreakDetails(habitId: string): Promise<void> {
    if (expandedStreakId === habitId) {
      setExpandedStreakId(null);
      return;
    }
    setExpandedStreakId(habitId);
    await loadStreakDetails(habitId);
  }

  return (
    <main className="today-page">
      <header className="today-header">
        <div className="today-heading">
          <p className="eyebrow">HABIT SHAPER</p>
          <h1>Kebiasaan hari ini</h1>
          <p>Langkah kecil yang kamu lakukan hari ini tetap berarti.</p>
        </div>
        <button
          className="logout-button"
          type="button"
          onClick={() => void logout()}
          disabled={logoutPending}
        >
          {logoutPending ? "Keluar…" : "Keluar"}
        </button>
      </header>
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
      ) : (
        <ul className="habit-list" aria-label="Daftar habit hari ini">
          {habits.map((habit) => {
            const doneLabel = habit.type === "NEGATIVE" ? "Hari bersih" : "Selesai";
            const streak = streakDetails[habit.id];
            return (
              <li className="habit-card" key={habit.id}>
                <div className="habit-copy">
                  <h2>{habit.title}</h2>
                  <p>
                    {habit.type === "NEGATIVE" ? "Menghentikan kebiasaan" : "Membangun kebiasaan"}
                  </p>
                </div>
                <div className="habit-actions">
                  <span
                    className={habit.checkedIn ? "habit-status is-done" : "habit-status is-pending"}
                  >
                    <span aria-hidden="true">{habit.checkedIn ? "✓" : "○"}</span>
                    {habit.checkedIn ? doneLabel : "Belum ditandai"}
                  </span>
                  <button
                    className={habit.checkedIn ? "check-in-button is-undo" : "check-in-button"}
                    type="button"
                    onClick={() => void toggleCheckIn(habit)}
                    disabled={pendingHabitIds.has(habit.id)}
                    aria-label={
                      habit.checkedIn
                        ? `Batalkan check-in: ${habit.title}`
                        : `Tandai ${doneLabel.toLowerCase()}: ${habit.title}`
                    }
                  >
                    {pendingHabitIds.has(habit.id)
                      ? "Menyimpan…"
                      : habit.checkedIn
                        ? "Batalkan"
                        : doneLabel}
                  </button>
                </div>
                <div className="streak-section">
                  <button
                    className="streak-toggle"
                    type="button"
                    aria-expanded={expandedStreakId === habit.id}
                    aria-controls={`streak-details-${habit.id}`}
                    onClick={() => void toggleStreakDetails(habit.id)}
                  >
                    {expandedStreakId === habit.id ? "Tutup detail streak" : "Lihat detail streak"}
                  </button>
                  <section
                    id={`streak-details-${habit.id}`}
                    className="streak-details"
                    aria-label={`Detail streak ${habit.title}`}
                    hidden={expandedStreakId !== habit.id}
                  >
                    {streakLoadingIds.has(habit.id) ? (
                      <p role="status">Memuat detail streak…</p>
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
                </div>
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
    </main>
  );
}
