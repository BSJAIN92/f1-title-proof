import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrCreateAnonymousVisitor } from "../../../src/server/anonymous-visitor";
import { loadAnonymousState } from "../../../src/server/convex-store";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const visitor = getOrCreateAnonymousVisitor({ get: (name) => cookieStore.get(name), set: (name, value, options) => cookieStore.set(name, value, options) });
  try { return NextResponse.json(await loadAnonymousState(visitor.hash)); }
  catch (error) { return NextResponse.json({ reason: error instanceof Error ? error.message : "Calculation history is unavailable." }, { status: 503 }); }
}
