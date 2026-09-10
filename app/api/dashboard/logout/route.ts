import { NextResponse } from "next/server";
import { DASHBOARD_COOKIE, dashboardCookieOptions } from "../../../../src/server/dashboard-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/dashboard/login", request.url), 303);
  response.cookies.set(DASHBOARD_COOKIE, "", { ...dashboardCookieOptions(), maxAge: 0 });
  return response;
}
