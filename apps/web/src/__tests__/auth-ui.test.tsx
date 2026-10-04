import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthForm } from "../app/auth/auth-form";
import { router, renderWithRouter } from "./test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => router }));

describe("auth form", () => {
  beforeEach(() => {
    router.replace.mockReset();
    router.push.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
  });

  it("UI-01 rejects invalid email without submitting to the API", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AuthForm />);
    await screen.findByRole("radio", { name: "Masuk" });
    await user.type(screen.getByRole("textbox", { name: "Email" }), "invalid");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /^Masuk$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("email yang valid");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("aria-invalid", "true");
  });

  it("UI-01 rejects a short registration password without an API request", async () => {
    const user = userEvent.setup();
    renderWithRouter(<AuthForm />);
    await screen.findByRole("button", { name: "Masuk" });
    await user.click(screen.getByRole("radio", { name: "Daftar" }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Buat akun" }));
    expect(await screen.findByText("Password minimal 8 karakter.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows an API authentication error accessibly", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Email atau password salah." } }), { status: 401 })));
    const user = userEvent.setup();
    renderWithRouter(<AuthForm />);
    await screen.findByRole("button", { name: "Masuk" });
    await user.type(screen.getByRole("textbox", { name: "Email" }), "user@example.com");
    await user.type(screen.getByLabelText("Password"), "secret");
    await user.click(screen.getByRole("button", { name: /^Masuk$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email atau password salah.");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });
});
