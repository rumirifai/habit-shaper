"use client";

import type { JSX } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export type HabitType = "POSITIVE" | "NEGATIVE";

type HabitTypeToggleProps = {
  value: HabitType;
  onValueChange: (value: HabitType) => void;
  ariaLabel?: string;
};

export default function HabitTypeToggle({
  value,
  onValueChange,
  ariaLabel = "Jenis habit",
}: HabitTypeToggleProps): JSX.Element {
  return (
    <ToggleGroup
      className="habit-type-toggle"
      type="single"
      value={value}
      aria-label={ariaLabel}
      onValueChange={(nextValue) => {
        if (nextValue === "POSITIVE" || nextValue === "NEGATIVE") onValueChange(nextValue);
      }}
    >
      <ToggleGroupItem className="habit-type-option" value="POSITIVE" aria-label="Positif — membangun kebiasaan">
        Positif <span>Membangun kebiasaan</span>
      </ToggleGroupItem>
      <ToggleGroupItem className="habit-type-option" value="NEGATIVE" aria-label="Negatif — menghentikan kebiasaan">
        Negatif <span>Menghentikan kebiasaan</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
