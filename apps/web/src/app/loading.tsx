import type { JSX } from "react";
import BrandLogo from "@/components/brand-logo";

export default function Loading(): JSX.Element {
  return (
    <main className="route-loading" aria-label="Memuat halaman">
      <BrandLogo className="route-loading-brand" />
      <p role="status">Memuat Habit Shaper…</p>
      <div className="route-loading-skeleton" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
