import type { JSX } from "react";
import GoalsPanel from "../goals-panel";
import SectionNavigation from "../section-navigation";
import BrandLogo from "@/components/brand-logo";

export default function GoalsPage(): JSX.Element {
  return (
    <main className="today-page">
      <header className="today-header">
        <div className="today-header-panel">
          <div className="today-heading">
            <BrandLogo />
            <h1>Goals</h1>
            <p>Rangkai habit yang kamu jalani menjadi tujuan.</p>
          </div>
          <SectionNavigation active="goals" />
        </div>
      </header>
      <GoalsPanel />
    </main>
  );
}
