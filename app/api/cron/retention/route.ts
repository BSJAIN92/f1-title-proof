import { NextResponse } from "next/server";
import { purgeExpiredActivity } from "../../../../src/server/convex-store";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ reason: "Not found." }, { status: 404 });
  try { return NextResponse.json(await purgeExpiredActivity()); }
  catch { return NextResponse.json({ reason: "Retention cleanup failed." }, { status: 503 }); }
}
