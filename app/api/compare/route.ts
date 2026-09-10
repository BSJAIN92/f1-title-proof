import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOrCreateAnonymousVisitor } from "../../../src/server/anonymous-visitor";
import { compareAndRecord, StoreFailure } from "../../../src/server/convex-store";
import { checkRateLimit, rateLimitedResponse } from "../../../src/server/rate-limit";
export const runtime="nodejs";
const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
export async function POST(request:Request){let body:unknown;try{body=await request.json()}catch{return NextResponse.json({reason:"The comparison request is not valid JSON."},{status:400})}
 const limit=await checkRateLimit(request,"compare");if(!limit.allowed)return rateLimitedResponse(limit.retryAfterSeconds);
 if(!record(body)||(body.kind!=="driver"&&body.kind!=="constructor")||typeof body.targetId!=="string"||typeof body.rivalId!=="string"||typeof body.dataVersion!=="string"||typeof body.ruleVersion!=="string")return NextResponse.json({reason:"The comparison request is malformed."},{status:400});
 const cookieStore=await cookies();const visitor=getOrCreateAnonymousVisitor({get:name=>cookieStore.get(name),set:(name,value,options)=>cookieStore.set(name,value,options)});
 try{const result=await compareAndRecord(visitor.hash,{kind:body.kind,targetId:body.targetId,rivalId:body.rivalId,dataVersion:body.dataVersion,ruleVersion:body.ruleVersion});return result.status==="ERROR"?NextResponse.json({reason:result.reason},{status:400}):NextResponse.json(result)}catch(error){const status=error instanceof StoreFailure&&error.code==="STALE"?400:503;return NextResponse.json({reason:error instanceof Error?error.message:"The comparison service is unavailable."},{status})}}
