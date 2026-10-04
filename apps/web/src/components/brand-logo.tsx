import type { JSX } from "react";

type BrandLogoProps = {
  className?: string;
};

export default function BrandLogo({ className = "" }: BrandLogoProps): JSX.Element {
  return (
    <span className={`brand-lockup${className ? ` ${className}` : ""}`}>
      <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <rect x="2" y="2" width="44" height="44" rx="14" fill="#365f53" />
        <path d="M14 34V21m0 8h20m0 5V21" fill="none" stroke="#f7fbf4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4" />
        <path d="M24 28V18" fill="none" stroke="#b1d3b9" strokeLinecap="round" strokeWidth="2.5" />
        <path d="M24 20c-5.4-.2-8.1-3-7.6-7.2 4.5-.2 7.4 2.1 7.6 7.2Z" fill="#b1d3b9" />
        <path d="M24 18.7c.2-5.2 3.4-7.8 7.8-7.4.2 4.5-2.5 7.2-7.8 7.4Z" fill="#dcebdd" />
      </svg>
      <span className="brand-wordmark">Habit Shaper</span>
    </span>
  );
}
