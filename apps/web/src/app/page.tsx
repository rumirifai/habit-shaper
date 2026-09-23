import type { JSX } from "react";

type HealthResponse = {
  status: string;
};

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record["status"] === "ok";
}

async function getApiHealth(): Promise<string> {
  const baseUrl = process.env["API_INTERNAL_URL"] ?? "http://api:4000";
  const url = `${baseUrl.replace(/\/$/, "")}/health`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return `unreachable (HTTP ${res.status})`;
    }
    const body: unknown = await res.json();
    return isHealthResponse(body) ? "ok" : "unexpected payload";
  } catch (e: unknown) {
    return e instanceof Error ? `unreachable (${e.message})` : "unreachable";
  }
}

type HomeProps = Record<string, never>;

export default async function Home(_props: HomeProps): Promise<JSX.Element> {
  const apiHealth = await getApiHealth();
  const publicApiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000/api/v1";

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "640px" }}>
      <h1>Habit Shaper — Phase 0</h1>
      <p>Compose up hijau. Web berjalan, API healthcheck via server fetch:</p>
      <ul>
        <li>API (internal): {apiHealth}</li>
        <li>NEXT_PUBLIC_API_URL: {publicApiUrl}</li>
      </ul>
      <p>
        <a href="/api/health">/api/health</a> (web) · API langsung: <code>/health</code> di :4000
      </p>
    </main>
  );
}
