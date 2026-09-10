"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function DashboardLogin() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/dashboard/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.get("password") }) });
    if (response.ok) { router.push("/dashboard"); router.refresh(); return; }
    const body = await response.json().catch(() => ({ reason: "Login is unavailable." })) as { reason?: string };
    setError(body.reason ?? "Login is unavailable."); setPending(false);
  }
  return <form className="dashboard-login__form" onSubmit={submit}>
    <label htmlFor="dashboard-password">Dashboard password</label>
    <input id="dashboard-password" name="password" type="password" autoComplete="current-password" required autoFocus />
    <button type="submit" disabled={pending}>{pending ? "Checking…" : "Open dashboard"}</button>
    <p className="dashboard-login__error" role="alert">{error}</p>
  </form>;
}
