import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOrCreateAnonymousVisitor } from "../../../src/server/anonymous-visitor";
import { calculateAndRecord, StoreFailure } from "../../../src/server/convex-store";

export const runtime = "nodejs";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ reason: "The calculation request is not valid JSON." }, { status: 400 }); }
  if (!isRecord(body) || (body.kind !== "driver" && body.kind !== "constructor") || typeof body.contenderId !== "string"
    || typeof body.dataVersion !== "string" || typeof body.ruleVersion !== "string") {
    return NextResponse.json({ reason: "The calculation request is malformed." }, { status: 400 });
  }
  const cookieStore = await cookies();
  const visitor = getOrCreateAnonymousVisitor({ get: (name) => cookieStore.get(name), set: (name, value, options) => cookieStore.set(name, value, options) });
  try {
    return NextResponse.json(await calculateAndRecord(visitor.hash, {
      kind: body.kind, contenderId: body.contenderId, dataVersion: body.dataVersion, ruleVersion: body.ruleVersion,
    }));
  } catch (error) {
    const status = error instanceof StoreFailure && (error.code === "INVALID_REQUEST" || error.code === "STALE") ? 400 : 503;
    return NextResponse.json({ reason: error instanceof Error ? error.message : "The calculation service is unavailable." }, { status });
  }
}
