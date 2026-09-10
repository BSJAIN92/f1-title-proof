import { NextResponse } from "next/server";
import { createDashboardSession, DASHBOARD_COOKIE, dashboardCookieOptions, verifyDashboardPassword } from "../../../../src/server/dashboard-auth";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ reason: "The login request is invalid." }, { status: 400 }); }
  const password = typeof body === "object" && body !== null && "password" in body && typeof body.password === "string" ? body.password : "";
  const configured = process.env.DASHBOARD_PASSWORD ?? "";
  const secret = process.env.DASHBOARD_SESSION_SECRET ?? "";
  if (!verifyDashboardPassword(password, configured)) return NextResponse.json({ reason: "That password is not correct." }, { status: 401 });
  let token: string;
  try { token = createDashboardSession(secret); } catch { return NextResponse.json({ reason: "Dashboard login is not configured." }, { status: 503 }); }
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(DASHBOARD_COOKIE, token, dashboardCookieOptions());
  return response;
}
