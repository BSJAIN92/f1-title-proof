import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ActivityDashboard } from "../../src/components/activity-dashboard";
import { parseDashboardRange } from "../../src/analytics/dashboard-contract";
import { DASHBOARD_COOKIE, isDashboardSessionValid } from "../../src/server/dashboard-auth";
import { loadDashboardSnapshot } from "../../src/server/convex-store";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const cookieStore = await cookies();
  if (!isDashboardSessionValid(cookieStore.get(DASHBOARD_COOKIE)?.value, process.env.DASHBOARD_SESSION_SECRET)) redirect("/dashboard/login");
  const range = parseDashboardRange(await searchParams);
  let snapshot;
  try { snapshot = await loadDashboardSnapshot(range); }
  catch { return <main className="dashboard-unavailable"><p className="eyebrow">Private telemetry</p><h1>Dashboard data unavailable</h1><p>The app is still running, but its activity report could not be loaded. Retry in a moment.</p><Link href="/dashboard">Retry</Link></main>; }
  return <ActivityDashboard snapshot={snapshot} />;
}
