import type { JSX } from "react";
import { AuthForm } from "./auth-form";
import BrandLogo from "@/components/brand-logo";

export default function AuthPage(): JSX.Element {
  return (
    <main className="auth-page">
      <a className="skip-link" href="#auth-form">
        Lewati ke formulir
      </a>
      <section className="auth-card" aria-labelledby="page-title">
        <BrandLogo />
        <h1 id="page-title">Bangun hari yang lebih baik.</h1>
        <p className="auth-intro">Masuk atau buat akun untuk melanjutkan.</p>
        <AuthForm />
      </section>
    </main>
  );
}
