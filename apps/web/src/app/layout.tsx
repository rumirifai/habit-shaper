import type { Metadata } from "next";
import type { JSX, ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Habit Shaper",
  description: "Habit Shaper — Phase 0 setup",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
