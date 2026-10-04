"use client";

import { useState, type JSX } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setAuthSession } from "./auth/auth-session";

type SectionNavigationProps = {
  active: "habit" | "goals";
};

export default function SectionNavigation({ active }: SectionNavigationProps): JSX.Element {
  const router = useRouter();
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout(): Promise<void> {
    if (logoutPending) return;
    setMenuOpen(false);
    setLogoutPending(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) {
        setLogoutError("Logout gagal. Silakan coba lagi.");
        return;
      }
      setAuthSession(null, null);
      router.replace("/auth");
    } catch {
      setLogoutError("Tidak dapat menghubungi layanan. Silakan coba lagi.");
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <div className="section-navigation-wrap">
      <nav
        className="section-navigation"
        aria-label="Navigasi utama"
        onKeyDown={(event) => {
          if (event.key === "Escape") setMenuOpen(false);
        }}
      >
        <button
          className="mobile-menu-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="section-navigation-links"
          aria-label={menuOpen ? "Tutup menu navigasi" : "Buka menu navigasi"}
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span className="mobile-menu-icon" aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
          <span className="mobile-menu-label">Menu</span>
        </button>
        <div id="section-navigation-links" className={menuOpen ? "section-navigation-links is-open" : "section-navigation-links"}>
        <Link href="/" aria-current={active === "habit" ? "page" : undefined} onClick={() => setMenuOpen(false)}>
          Habits
        </Link>
        <Link href="/goals" aria-current={active === "goals" ? "page" : undefined} onClick={() => setMenuOpen(false)}>
          Goals
        </Link>
        <button className="mobile-logout-item" type="button" onClick={() => void logout()} disabled={logoutPending}>
          {logoutPending ? "Keluar…" : "Keluar"}
        </button>
        </div>
      </nav>
      <div className="navigation-message" aria-live="polite" aria-atomic="true">
        {logoutError ? <p className="error-message" role="alert">{logoutError}</p> : null}
      </div>
    </div>
  );
}
