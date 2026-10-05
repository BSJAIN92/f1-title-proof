import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const oldDir = resolve(root, "data/frozen/2026-09-27");
const newDir = resolve(root, "data/frozen/2026-10-05");
const cutoff = "2026-10-05T11:25:19+05:30";
const baseUrl = "https://api.fia.com/system/files/decision-document/2026_bahrain_grand_prix_in_malaysia_-_";
const raceUrl = `${baseUrl}final_race_classification.pdf`;
const qualifyingUrl = `${baseUrl}final_qualifying_classification.pdf`;
const pointsUrl = `${baseUrl}championship_points.pdf`;
const read = (name) => JSON.parse(readFileSync(resolve(oldDir, name), "utf8"));
const write = (name, value) => writeFileSync(resolve(newDir, name), `${JSON.stringify(value, null, 2)}\n`);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex").toUpperCase();
const canonical = (value) => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;

mkdirSync(newDir, { recursive: true });
for (const name of ["classified-retirement-fixture.json", "validate.ps1"]) cpSync(resolve(oldDir, name), resolve(newDir, name));
const manifest = read("manifest.json"), results = read("session-results.json"), countback = read("countback.json"), sources = read("source-documents.json");
const teams = Object.fromEntries(manifest.futureLineup.flatMap(({ constructor, drivers }) => drivers.map((driver) => [driver, constructor])));
const cars = {"Max Verstappen":3,"Kimi Antonelli":12,"Lewis Hamilton":44,"Charles Leclerc":16,"Isack Hadjar":6,"Oscar Piastri":81,"Liam Lawson":30,"Fernando Alonso":14,"Lando Norris":1,"Arvid Lindblad":41,"Nico Hulkenberg":27,"Lance Stroll":18,"Franco Colapinto":43,"Oliver Bearman":87,"Esteban Ocon":31,"Pierre Gasly":10,"Carlos Sainz":55,"Gabriel Bortoleto":5,"Sergio Perez":11,"George Russell":63,"Alexander Albon":23,"Valtteri Bottas":77};
const raceOrder = ["Max Verstappen","Kimi Antonelli","Lewis Hamilton","Charles Leclerc","Isack Hadjar","Oscar Piastri","Liam Lawson","Fernando Alonso","Lando Norris","Arvid Lindblad","Nico Hulkenberg","Lance Stroll","Franco Colapinto","Oliver Bearman","Esteban Ocon","Pierre Gasly","Carlos Sainz","Gabriel Bortoleto","Sergio Perez","George Russell","Alexander Albon","Valtteri Bottas"];
const qualifyingOrder = ["Max Verstappen","Lewis Hamilton","Isack Hadjar","Kimi Antonelli","Charles Leclerc","Lando Norris","Oscar Piastri","George Russell","Pierre Gasly","Gabriel Bortoleto","Liam Lawson","Fernando Alonso","Carlos Sainz","Lance Stroll","Franco Colapinto","Arvid Lindblad","Nico Hulkenberg","Oliver Bearman","Esteban Ocon","Alexander Albon","Valtteri Bottas","Sergio Perez"];
const laps = [55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,55,49,41,7];
const officialDriverOrder = ["Kimi Antonelli","George Russell","Lewis Hamilton","Charles Leclerc","Lando Norris","Max Verstappen","Oscar Piastri","Isack Hadjar","Liam Lawson","Pierre Gasly","Arvid Lindblad","Franco Colapinto","Oliver Bearman","Gabriel Bortoleto","Nico Hulkenberg","Esteban Ocon","Fernando Alonso","Carlos Sainz","Alexander Albon","Yuki Tsunoda","Lance Stroll","Valtteri Bottas","Sergio Perez"];
const officialDriverPoints = [320,236,214,191,188,188,128,96,65,41,38,27,20,10,7,7,7,7,5,1,0,0,0];
const officialConstructorPoints = [556,405,316,298,90,68,27,17,12,7,0];
if (raceOrder.length !== 22 || qualifyingOrder.length !== 22 || new Set(raceOrder).size !== 22 || new Set(qualifyingOrder).size !== 22) throw new Error("Bahrain classifications must contain 22 unique drivers.");
results.sources.bahrain_at_sepang_malaysia_race = raceUrl;
results.events.push({event:"bahrain_at_sepang_malaysia",session:"race",rows:raceOrder.map((driver,index)=>({
  driver,car:cars[driver],constructor:teams[driver],position:index<20?index+1:null,classification:index<20?String(index+1):"NC",
  status:index<19?"CLASSIFIED":"DNF",laps:laps[index],awarded_points:manifest.scoring.race[index]??0,
  fia_detail:"Official final classification; see sources.bahrain_at_sepang_malaysia_race"
}))});
countback.qualifying_events.push({event:"bahrain_at_sepang_malaysia",source_url:qualifyingUrl,rows:qualifyingOrder.map((driver,index)=>({position:index+1,driver,car:cars[driver],constructor:teams[driver],classification:String(index+1)}))});
const increment = (histograms,key,position) => { const histogram = histograms[key]??={}; histogram[position]=(histogram[position]??0)+1; };
for (const [index,driver] of raceOrder.entries()) if (index<20) {
  increment(countback.driver_race_finish_histograms,driver,String(index+1));
  increment(countback.constructor_race_finish_histograms,teams[driver],String(index+1));
}
for (const [index,driver] of qualifyingOrder.entries()) {
  increment(countback.driver_qualifying_position_histograms,driver,String(index+1));
  increment(countback.constructor_qualifying_position_histograms,teams[driver],String(index+1));
}
for (const row of results.events.at(-1).rows) {
  results.driver_standings[row.driver]=(results.driver_standings[row.driver]??0)+row.awarded_points;
  results.constructor_standings[row.constructor]=(results.constructor_standings[row.constructor]??0)+row.awarded_points;
}
results.driver_race_position_histograms=countback.driver_race_finish_histograms;
results.constructor_race_position_histograms=countback.constructor_race_finish_histograms;
results.remaining=results.remaining.filter(({event})=>event!=="bahrain_at_sepang_malaysia");
for (const row of manifest.driverStandings) row.points=results.driver_standings[row.driver];
manifest.driverStandings.sort((a,b)=>officialDriverOrder.indexOf(a.driver)-officialDriverOrder.indexOf(b.driver)).forEach((row,index)=>{
  row.position=index+1;
  if (row.driver!==officialDriverOrder[index] || row.points!==officialDriverPoints[index]) throw new Error(`FIA driver standings mismatch at position ${index+1}: ${row.driver} ${row.points}.`);
});
for (const row of manifest.constructorStandings) row.points=results.constructor_standings[row.constructor];
manifest.constructorStandings.sort((a,b)=>b.points-a.points||a.position-b.position).forEach((row,index)=>{
  row.position=index+1;
  if (row.points!==officialConstructorPoints[index]) throw new Error(`FIA constructor standings mismatch at position ${index+1}: ${row.constructor} ${row.points}.`);
});
manifest.remainingSessions=manifest.remainingSessions.filter(({event})=>event!=="Bahrain Grand Prix");
manifest.dataVersion=manifest.cutoff.local=cutoff;
manifest.cutoff.utc="2026-10-05T05:55:19Z";
manifest.approval.approvedAt=cutoff;
manifest.sourcePolicy.retrievedAt=cutoff;
manifest.sourcePolicy.manualExtractionReview="Bahrain Grand Prix in Malaysia race and qualifying were checked row-by-row against FIA Docs 60 and 42. Driver and constructor standings were checked against FIA Doc 61. Doc 61 notes Audi's notice of intention to appeal an Italian Grand Prix decision.";
async function sourceDocument(id,category,url) {
  const response=await fetch(url);
  if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error(`${id} did not return a PDF: HTTP ${response.status}.`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  return {id,category,url,retrievedAt:cutoff,httpStatus:response.status,contentType:[response.headers.get("content-type")],byteLength:bytes.byteLength,sha256:sha(bytes)};
}
sources.documents.push(...await Promise.all([
  sourceDocument("bahrain_at_sepang_malaysia_race","final-session-classification",raceUrl),
  sourceDocument("bahrain_at_sepang_malaysia_qualifying","final-qualifying-classification",qualifyingUrl),
  sourceDocument("bahrain_at_sepang_malaysia_championship_points","snapshot-support",pointsUrl),
]));
sources.cutoff=cutoff;
write("session-results.json",results);
write("countback.json",countback);
write("source-documents.json",sources);
manifest.artifacts.sessionResults.sha256=sha(readFileSync(resolve(newDir,"session-results.json")));
manifest.artifacts.countback.sha256=sha(readFileSync(resolve(newDir,"countback.json")));
manifest.artifacts.sourceDocuments.sha256=sha(readFileSync(resolve(newDir,"source-documents.json")));
write("manifest.json",manifest);
const validatorPath=resolve(newDir,"validate.ps1");
let validator=readFileSync(validatorPath,"utf8");
for (const [from,to] of [
  ["events.Count 21","events.Count 22"],[") 15 'completed races'",") 16 'completed races'"],[") 445 'completed classification and reconciliation rows'",") 467 'completed classification and reconciliation rows'"],
  ["qualifying_events.Count 15","qualifying_events.Count 16"],[") 330 'qualifying rows'",") 352 'qualifying rows'"],["remainingSessions.Count 9","remainingSessions.Count 8"],["documents.Count 42","documents.Count 45"],
  ["$classifiedDnfs.Count 7","$classifiedDnfs.Count 8"],["'Oliver Bearman:17','Valtteri Bottas:16'","'George Russell:20','Oliver Bearman:17','Valtteri Bottas:16'"],
  ["position) 17 'FIA Sainz rank on seven points'","position) 18 'FIA Sainz rank on seven points'"],
  ["points) 263 'FIA Red Bull points'","points) 298 'FIA Red Bull points'"],["points) 83 'FIA Racing Bulls points'","points) 90 'FIA Racing Bulls points'"]
]) { if (!validator.includes(from)) throw new Error(`Validator pattern not found: ${from}`); validator=validator.replace(from,to); }
writeFileSync(validatorPath,validator);
writeFileSync(resolve(newDir,"README.md"),`# Frozen 2026 Formula 1 data\n\nSnapshot through the Bahrain Grand Prix in Malaysia at **2026-10-05 11:25:19 IST (UTC+05:30)**.\n\nThe Sepang race and qualifying classifications come from FIA Docs 60 and 42. The driver and constructor standings match FIA Doc 61, which notes Audi's notice of intention to appeal an Italian Grand Prix decision. Earlier snapshots remain intact.\n\nRun \`powershell -NoProfile -ExecutionPolicy Bypass -File data/frozen/2026-10-05/validate.ps1\` from \`v1\`.\n`);
const roster=manifest.futureLineup.flatMap(({constructor,drivers})=>drivers.map((driverId)=>({driverId,constructorId:constructor})));
const sessions=manifest.remainingSessions.map(({date,event,type},sequenceIndex)=>({id:`${date}:${event}:${type}`,session:type,sequenceIndex}));
const driverIds=new Set(roster.map(({driverId})=>driverId));
const constructorIds=new Set(roster.map(({constructorId})=>constructorId));
const relevant={dataVersion:manifest.dataVersion,ruleVersion:manifest.ruleVersion,roster,sessions,scoring:{race:manifest.scoring.race,sprint:manifest.scoring.sprint},
  standings:[...driverIds].sort().map((id)=>({id,points:results.driver_standings[id],race:countback.driver_race_finish_histograms[id],qualifying:countback.driver_qualifying_position_histograms[id]})),
  constructorStandings:[...constructorIds].sort().map((id)=>({id,points:results.constructor_standings[id],race:countback.constructor_race_finish_histograms[id],qualifying:countback.constructor_qualifying_position_histograms[id]}))};
console.log(JSON.stringify({dataVersion:cutoff,manifestSha256:sha(readFileSync(resolve(newDir,"manifest.json"))),artifactSha256:{"session-results.json":manifest.artifacts.sessionResults.sha256,"countback.json":manifest.artifacts.countback.sha256,"source-documents.json":manifest.artifacts.sourceDocuments.sha256},snapshotFingerprint:`sha256-${sha(canonical(relevant)).toLowerCase()}`},null,2));
