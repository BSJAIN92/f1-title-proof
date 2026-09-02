import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrCreateAnonymousVisitor } from "../../../src/server/anonymous-visitor";
import { reopenOwnedHistory, StoreFailure } from "../../../src/server/convex-store";

export const runtime = "nodejs";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ reason: "The reopen request is not valid JSON." }, { status: 400 }); }
  if (!isRecord(body) || typeof body.historyId !== "string" || !body.historyId) {
    return NextResponse.json({ reason: "The reopen request is malformed." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const visitor = getOrCreateAnonymousVisitor({ get: (name) => cookieStore.get(name), set: (name, value, options) => cookieStore.set(name, value, options) });
  try { return NextResponse.json(await reopenOwnedHistory(visitor.hash, body.historyId)); }
  catch (error) {
    const status = error instanceof StoreFailure && error.code === "NOT_FOUND" ? 404 : error instanceof StoreFailure && error.code === "INVALID_REQUEST" ? 400 : 503;
    return NextResponse.json({ reason: error instanceof Error ? error.message : "That calculation could not be reopened." }, { status });
  }
}
