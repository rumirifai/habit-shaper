import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { expect, it, vi } from "vitest";
import SectionNavigation from "../app/section-navigation";
import { renderWithRouter, router } from "./test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

it("UI-16 opens and closes the mobile navigation with keyboard controls", async () => {
  const user = userEvent.setup();
  renderWithRouter(<SectionNavigation active="habit" />);
  const toggle = screen.getByRole("button", { name: "Buka menu navigasi" });

  await user.tab();
  expect(toggle).toHaveFocus();
  await user.keyboard("{Enter}");
  expect(screen.getByRole("button", { name: "Tutup menu navigasi" })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "Habits" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Goals" })).toHaveAttribute("href", "/goals");
  expect(screen.getByRole("button", { name: "Keluar" })).toBeInTheDocument();

  await user.tab();
  expect(screen.getByRole("link", { name: "Habits" })).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Buka menu navigasi" })).toHaveAttribute("aria-expanded", "false");

  await user.keyboard("{Shift>}{Tab}{/Shift}");
  await user.keyboard(" ");
  expect(screen.getByRole("button", { name: "Tutup menu navigasi" })).toHaveAttribute("aria-expanded", "true");
});
