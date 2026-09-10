import { NextResponse } from "next/server";
import { loadGuaranteedScenarios, StoreFailure } from "../../../src/server/convex-store";
import { checkRateLimit, rateLimitedResponse } from "../../../src/server/rate-limit";

export const runtime = "nodejs";
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

export async function POST(request: Request) {
  const limit = await checkRateLimit(request, "scenarios");
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ reason:"The scenario request is not valid JSON." }, { status:400 }); }
  if (!record(body) || (body.kind !== "driver" && body.kind !== "constructor") || typeof body.contenderId !== "string" || typeof body.dataVersion !== "string" || typeof body.ruleVersion !== "string" || (body.cursor !== undefined && typeof body.cursor !== "string")) return NextResponse.json({ reason:"The scenario request is malformed." }, { status:400 });
  try {
    const result = await loadGuaranteedScenarios({ kind:body.kind, contenderId:body.contenderId, dataVersion:body.dataVersion, ruleVersion:body.ruleVersion, ...(body.cursor ? { cursor:body.cursor } : {}) });
    if ("status" in result) return NextResponse.json({ reason:result.reason }, { status:400, headers:{ "Cache-Control":"private, no-store" } });
    return NextResponse.json(result, { headers:{ "Cache-Control":"private, no-store" } });
  } catch (error) {
    const status = error instanceof StoreFailure && (error.code === "STALE" || error.code === "INVALID_REQUEST") ? 400 : 503;
    return NextResponse.json({ reason:error instanceof Error ? error.message : "The scenario service is unavailable." }, { status, headers:{ "Cache-Control":"private, no-store" } });
  }
}
