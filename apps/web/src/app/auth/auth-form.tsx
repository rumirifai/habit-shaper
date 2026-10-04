"use client";

import { useEffect, useState, type FormEvent, type JSX } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { setAuthSession, type AuthUser } from "./auth-session";

type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

function isAuthResponse(value: unknown): value is AuthResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const user = record["user"];
  if (typeof record["accessToken"] !== "string" || typeof user !== "object" || user === null) {
    return false;
  }
  const userRecord = user as Record<string, unknown>;
  return (
    typeof userRecord["id"] === "string" &&
    typeof userRecord["email"] === "string" &&
    (typeof userRecord["name"] === "string" || userRecord["name"] === null)
  );
}

function errorMessage(value: unknown): string {
  if (typeof value !== "object" || value === null) return "Permintaan gagal. Coba lagi.";
  const error = (value as Record<string, unknown>)["error"];
  if (typeof error !== "object" || error === null) return "Permintaan gagal. Coba lagi.";
  const message = (error as Record<string, unknown>)["message"];
  return typeof message === "string" ? message : "Permintaan gagal. Coba lagi.";
}

export function AuthForm(): JSX.Element {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const emailError = error.includes("email") || error.includes("Email");
  const passwordError = error.includes("Password");
  const generalError = error && !emailError && !passwordError ? error : "";

  useEffect(() => {
    let active = true;
    async function refreshSession(): Promise<void> {
      try {
        const response = await fetch("/api/v1/auth/refresh", { method: "POST" });
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (active && isAuthResponse(body)) {
          setAuthSession(body.accessToken, body.user);
          router.replace("/");
        }
      } catch {
        // A missing/expired refresh cookie simply leaves the user signed out.
      } finally {
        if (active) setCheckingSession(false);
      }
    }
    void refreshSession();
    return () => {
      active = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    if (password.length < (mode === "register" ? 8 : 1)) {
      setError(mode === "register" ? "Password minimal 8 karakter." : "Masukkan password.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/v1/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          ...(mode === "register" && name.trim() ? { name: name.trim() } : {}),
        }),
      });
      const body: unknown = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        setError(errorMessage(body));
      } else if (mode === "register") {
        setMode("login");
        setNotice("Akun berhasil dibuat. Silakan masuk.");
        setPassword("");
      } else if (isAuthResponse(body)) {
        setAuthSession(body.accessToken, body.user);
        router.push("/");
      } else {
        setError("Respons autentikasi tidak dikenali.");
      }
    } catch {
      setError("Tidak dapat menghubungi layanan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="auth-form">
      {checkingSession ? (
        <p className="loading-message" role="status">
          Memeriksa sesi…
        </p>
      ) : (
        <>
          <ToggleGroup
            className="auth-tabs"
            type="single"
            variant="outline"
            value={mode}
            aria-label="Pilih autentikasi"
            onValueChange={(value) => {
              if (value !== "login" && value !== "register") return;
              setMode(value);
              setError("");
              setNotice("");
            }}
          >
            <ToggleGroupItem value="login" size="lg">
              Masuk
            </ToggleGroupItem>
            <ToggleGroupItem value="register" size="lg">
              Daftar
            </ToggleGroupItem>
          </ToggleGroup>
          <form onSubmit={submit} noValidate>
            <FieldGroup className="gap-4">
              {mode === "register" && (
                <Field>
                  <FieldLabel htmlFor="name">
                    Nama <span className="optional">(opsional)</span>
                  </FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
              )}
              <Field data-invalid={emailError || undefined}>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={emailError || undefined}
                  aria-describedby={emailError ? "email-error" : undefined}
                />
                {emailError ? <FieldError id="email-error">{error}</FieldError> : null}
              </Field>
              <Field data-invalid={passwordError || undefined}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "register" ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={passwordError || undefined}
                  aria-describedby={passwordError ? "password-error" : undefined}
                />
                {mode === "register" ? (
                  <FieldDescription>Minimal 8 karakter.</FieldDescription>
                ) : null}
                {passwordError ? <FieldError id="password-error">{error}</FieldError> : null}
              </Field>
            </FieldGroup>
            <Button className="mt-4 w-full" size="lg" type="submit" disabled={busy}>
              {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Buat akun"}
            </Button>
          </form>
        </>
      )}
      <div className="form-message" aria-live="polite" aria-atomic="true">
        {generalError && (
          <p id="auth-error" className="error-message" role="alert">
            {generalError}
          </p>
        )}
        {notice && (
          <p className="success-message" role="status">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}
