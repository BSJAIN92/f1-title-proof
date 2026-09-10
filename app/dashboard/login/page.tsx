import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DashboardLogin } from "../../../src/components/dashboard-login";
import { DASHBOARD_COOKIE, isDashboardSessionValid } from "../../../src/server/dashboard-auth";

export default async function DashboardLoginPage() {
  const cookieStore = await cookies();
  if (isDashboardSessionValid(cookieStore.get(DASHBOARD_COOKIE)?.value, process.env.DASHBOARD_SESSION_SECRET)) redirect("/dashboard");
  return <main className="dashboard-login">
    <section>
      <p className="eyebrow">Title Proof · private telemetry</p>
      <h1>Activity dashboard</h1>
      <p>Enter the private password to view visitor and comparison activity.</p>
      <DashboardLogin />
      <Link href="/">← Return to the app</Link>
    </section>
  </main>;
}
