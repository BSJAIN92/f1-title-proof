import { NextResponse } from "next/server";
import { compareActiveHeadToHead, StoreFailure } from "../../../src/server/convex-store";
export const runtime="nodejs";
const record=(value:unknown):value is Record<string,unknown>=>typeof value==="object"&&value!==null&&!Array.isArray(value);
export async function POST(request:Request){let body:unknown;try{body=await request.json()}catch{return NextResponse.json({reason:"The comparison request is not valid JSON."},{status:400})}
 if(!record(body)||(body.kind!=="driver"&&body.kind!=="constructor")||typeof body.targetId!=="string"||typeof body.rivalId!=="string"||typeof body.dataVersion!=="string"||typeof body.ruleVersion!=="string")return NextResponse.json({reason:"The comparison request is malformed."},{status:400});
 try{const result=await compareActiveHeadToHead({kind:body.kind,targetId:body.targetId,rivalId:body.rivalId,dataVersion:body.dataVersion,ruleVersion:body.ruleVersion});return result.status==="ERROR"?NextResponse.json({reason:result.reason},{status:400}):NextResponse.json(result)}catch(error){const status=error instanceof StoreFailure&&error.code==="STALE"?400:503;return NextResponse.json({reason:error instanceof Error?error.message:"The comparison service is unavailable."},{status})}}
