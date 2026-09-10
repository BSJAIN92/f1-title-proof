import { describe, expect, it } from "vitest";
import { approvedSnapshotFixture } from "../test/approved-frozen-fixture";
import { calculateHeadToHead } from "./head-to-head";
const snapshot=approvedSnapshotFixture();
const request=(kind:"driver"|"constructor",targetId:string,rivalId:string)=>({kind,targetId,rivalId,dataVersion:snapshot.dataVersion,ruleVersion:snapshot.ruleVersion});
describe("head-to-head comparison",()=>{
 it("covers every Kimi-versus-George points combination with one exact rule and winning examples",()=>{const result=calculateHeadToHead(snapshot,request("driver","Kimi Antonelli","George Russell"));expect(result).toMatchObject({status:"COMPLETE",currentGap:66,requiredRemainingDifference:-65});if(result.status==="COMPLETE"){expect(result.examples.length).toBeGreaterThan(0);expect(result.examples.every(x=>x.finalMargin>0&&x.events.length===11)).toBe(true)}});
 it("supports two-car team comparisons",()=>{const result=calculateHeadToHead(snapshot,request("constructor","Scuderia Ferrari HP","Mercedes-AMG PETRONAS F1 Team"));expect(result).toMatchObject({status:"COMPLETE",currentGap:-122,requiredRemainingDifference:123});if(result.status==="COMPLETE")expect(result.examples.every(x=>x.events.every(e=>e.includes(" + ")))).toBe(true)});
 it("labels zero-point finishes below the scoring positions",()=>{const result=calculateHeadToHead(snapshot,request("driver","Lewis Hamilton","Kimi Antonelli"));if(result.status!=="COMPLETE")throw new Error("Expected a complete comparison");const events=result.examples.flatMap(example=>example.events);expect(events.some(event=>event.includes(":race —")&&event.includes("P11+ (0)"))).toBe(true);expect(events.some(event=>event.includes(":sprint —")&&event.includes("P9+ (0)"))).toBe(true);expect(events.every(event=>!event.includes("no points"))).toBe(true)});
 it("rejects the same competitor and stale data",()=>{expect(calculateHeadToHead(snapshot,request("driver","Kimi Antonelli","Kimi Antonelli"))).toMatchObject({status:"ERROR"});expect(calculateHeadToHead(snapshot,{...request("driver","Kimi Antonelli","George Russell"),dataVersion:"old"})).toMatchObject({status:"ERROR"})});
});
