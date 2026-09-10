import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrCreateAnonymousVisitor } from "../../../src/server/anonymous-visitor";
import { recordComparisonReturn } from "../../../src/server/convex-store";
import { checkRateLimit } from "../../../src/server/rate-limit";

export const runtime = "nodejs";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  const limit = await checkRateLimit(request, "comparison_return");
  if (!limit.allowed) return new NextResponse(null, { status: 204 });
  let body: unknown;
  try { body = await request.json(); } catch { return new NextResponse(null, { status: 400 }); }
  if (!isRecord(body) || (body.kind !== "driver" && body.kind !== "constructor") || typeof body.targetId !== "string" || !body.targetId
    || typeof body.rivalId !== "string" || !body.rivalId || typeof body.dataVersion !== "string" || !body.dataVersion || typeof body.ruleVersion !== "string") {
    return new NextResponse(null, { status: 400 });
  }
  const cookieStore = await cookies();
  const visitor = getOrCreateAnonymousVisitor({ get: (name) => cookieStore.get(name), set: (name, value, options) => cookieStore.set(name, value, options) });
  try { await recordComparisonReturn(visitor.hash, { kind: body.kind, targetId: body.targetId, rivalId: body.rivalId, dataVersion: body.dataVersion, ruleVersion: body.ruleVersion }); } catch { /* Analytics must never block navigation. */ }
  return new NextResponse(null, { status: 204 });
}
