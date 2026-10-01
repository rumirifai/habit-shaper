import type { JSX } from "react";
import { AuthForm } from "./auth-form";

export default function AuthPage(): JSX.Element {
  return (
    <main className="auth-page">
      <a className="skip-link" href="#auth-form">
        Lewati ke formulir
      </a>
      <section className="auth-card" aria-labelledby="page-title">
        <p className="eyebrow">HABIT SHAPER</p>
        <h1 id="page-title">Bangun hari yang lebih baik.</h1>
        <p className="auth-intro">Masuk atau buat akun untuk melanjutkan.</p>
        <AuthForm />
      </section>
    </main>
  );
}
