import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrCreateAnonymousVisitor } from "../../../src/server/anonymous-visitor";
import { recordAnonymousVisit } from "../../../src/server/convex-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const visitor = getOrCreateAnonymousVisitor({ get: (name) => cookieStore.get(name), set: (name, value, options) => cookieStore.set(name, value, options) });
  try { await recordAnonymousVisit(visitor.hash, request.headers.get("x-vercel-ip-country") ?? undefined); } catch { /* Analytics must never block the product. */ }
  return new NextResponse(null, { status: 204 });
}
