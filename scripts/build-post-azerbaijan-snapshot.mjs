import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const oldDir = resolve(root, "data/frozen/2026-09-23");
const newDir = resolve(root, "data/frozen/2026-09-27");
const cutoff = "2026-09-27T09:46:00+05:30";
const baseUrl = "https://www.fia.com/system/files/decision-document/2026_azerbaijan_grand_prix_-_";
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
// Spain's source PDF lists Lawson with Red Bull. Correct the earlier extraction in this new version.
const spainLawson = results.events.find(({event,session})=>event==="spain_madrid"&&session==="race")?.rows.find(({driver})=>driver==="Liam Lawson");
const spainQualifyingLawson = countback.qualifying_events.find(({event})=>event==="spain_madrid")?.rows.find(({driver})=>driver==="Liam Lawson");
if (!spainLawson || !spainQualifyingLawson || spainLawson.constructor!=="Visa Cash App Racing Bulls F1 Team" || spainQualifyingLawson.constructor!=="Visa Cash App Racing Bulls F1 Team") throw new Error("Expected the earlier Spain Lawson assignment.");
const racingBulls="Visa Cash App Racing Bulls F1 Team", redBull="Oracle Red Bull Racing";
spainLawson.constructor=redBull;
spainQualifyingLawson.constructor=redBull;
results.constructor_standings[racingBulls]-=spainLawson.awarded_points;
results.constructor_standings[redBull]+=spainLawson.awarded_points;
for (const [histograms,position] of [[countback.constructor_race_finish_histograms,"6"],[countback.constructor_qualifying_position_histograms,"8"]]) {
  if ((histograms[racingBulls][position]??0)<1) throw new Error("Missing Spain Lawson countback entry.");
  histograms[racingBulls][position]-=1;
  histograms[redBull][position]=(histograms[redBull][position]??0)+1;
}
const teams = Object.fromEntries(manifest.futureLineup.flatMap(({ constructor, drivers }) => drivers.map((driver) => [driver, constructor])));
const cars = {"George Russell":63,"Max Verstappen":3,"Isack Hadjar":6,"Charles Leclerc":16,"Kimi Antonelli":12,"Lewis Hamilton":44,"Arvid Lindblad":41,"Esteban Ocon":31,"Oliver Bearman":87,"Carlos Sainz":55,"Nico Hulkenberg":27,"Liam Lawson":30,"Oscar Piastri":81,"Sergio Perez":11,"Gabriel Bortoleto":5,"Valtteri Bottas":77,"Franco Colapinto":43,"Pierre Gasly":10,"Lando Norris":1,"Alexander Albon":23,"Fernando Alonso":14,"Lance Stroll":18};
const raceOrder = ["George Russell","Max Verstappen","Isack Hadjar","Charles Leclerc","Kimi Antonelli","Lewis Hamilton","Arvid Lindblad","Esteban Ocon","Oliver Bearman","Carlos Sainz","Nico Hulkenberg","Liam Lawson","Oscar Piastri","Sergio Perez","Gabriel Bortoleto","Valtteri Bottas","Franco Colapinto","Pierre Gasly","Lando Norris","Alexander Albon","Fernando Alonso","Lance Stroll"];
const laps = [51,51,51,51,51,51,51,51,51,51,51,51,51,51,51,49,36,35,35,29,20,7];
const qualifyingOrder = ["George Russell","Charles Leclerc","Oscar Piastri","Isack Hadjar","Lando Norris","Lewis Hamilton","Pierre Gasly","Max Verstappen","Carlos Sainz","Franco Colapinto","Oliver Bearman","Liam Lawson","Alexander Albon","Esteban Ocon","Arvid Lindblad","Kimi Antonelli","Gabriel Bortoleto","Nico Hulkenberg","Fernando Alonso","Sergio Perez","Lance Stroll","Valtteri Bottas"];
const officialDriverOrder = ["Kimi Antonelli","George Russell","Lewis Hamilton","Lando Norris","Charles Leclerc","Max Verstappen","Oscar Piastri","Isack Hadjar","Liam Lawson","Pierre Gasly","Arvid Lindblad","Franco Colapinto","Oliver Bearman","Gabriel Bortoleto","Nico Hulkenberg","Esteban Ocon","Carlos Sainz","Alexander Albon","Fernando Alonso","Yuki Tsunoda","Lance Stroll","Valtteri Bottas","Sergio Perez"];
const officialDriverPoints = [302,236,199,186,179,163,120,86,59,41,37,27,20,10,7,7,7,5,3,1,0,0,0];
const officialConstructorPoints = [538,378,306,263,83,68,27,17,12,3,0];
const points = manifest.scoring.race;
if (raceOrder.length !== 22 || qualifyingOrder.length !== 22 || new Set(raceOrder).size !== 22 || new Set(qualifyingOrder).size !== 22) throw new Error("Azerbaijan classifications must contain 22 unique drivers.");
results.sources.azerbaijan_race = raceUrl;
results.events.push({event:"azerbaijan",session:"race",rows:raceOrder.map((driver,index)=>({
  driver,car:cars[driver],constructor:teams[driver],position:index<16?index+1:null,classification:index<16?String(index+1):"NC",
  status:index<15?"CLASSIFIED":"DNF",laps:laps[index],awarded_points:points[index]??0,
  fia_detail:"Official final classification; see sources.azerbaijan_race"
}))});
countback.qualifying_events.push({event:"azerbaijan",source_url:qualifyingUrl,rows:qualifyingOrder.map((driver,index)=>({position:index+1,driver,car:cars[driver],constructor:teams[driver],classification:String(index+1)}))});
const increment = (histograms,key,position) => { const histogram = histograms[key]??={}; histogram[position]=(histogram[position]??0)+1; };
for (const [index,driver] of raceOrder.entries()) if (index<16) {
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
results.remaining=results.remaining.filter(({event})=>event!=="azerbaijan");
for (const row of manifest.driverStandings) row.points=results.driver_standings[row.driver];
manifest.driverStandings.sort((a,b)=>officialDriverOrder.indexOf(a.driver)-officialDriverOrder.indexOf(b.driver)).forEach((row,index)=>{
  row.position=index+1;
  if (row.driver!==officialDriverOrder[index] || row.points!==officialDriverPoints[index]) throw new Error(`FIA driver standings mismatch at position ${index+1}.`);
});
for (const row of manifest.constructorStandings) row.points=results.constructor_standings[row.constructor];
manifest.constructorStandings.sort((a,b)=>b.points-a.points||a.position-b.position).forEach((row,index)=>{
  row.position=index+1;
  if (row.points!==officialConstructorPoints[index]) throw new Error(`FIA constructor standings mismatch at position ${index+1}.`);
});
manifest.remainingSessions=manifest.remainingSessions.filter(({event})=>event!=="Azerbaijan");
manifest.dataVersion=manifest.cutoff.local=cutoff;
manifest.cutoff.utc="2026-09-27T04:16:00Z";
manifest.approval.approvedAt=cutoff;
manifest.sourcePolicy.retrievedAt=cutoff;
manifest.sourcePolicy.manualExtractionReview="Azerbaijan race and qualifying were checked row-by-row against FIA Docs 71 and 51. Driver and constructor totals were checked against FIA Doc 72. Spain's Lawson team assignment was corrected against the FIA Spain race and qualifying classifications. The Azerbaijan race classification notes ongoing routine technical checks and the points document notes an Italian Grand Prix appeal.";

async function sourceDocument(id,category,url) {
  const response=await fetch(url);
  if (!response.ok || !response.headers.get("content-type")?.includes("application/pdf")) throw new Error(`${id} did not return a PDF: HTTP ${response.status}.`);
  const bytes=new Uint8Array(await response.arrayBuffer());
  return {id,category,url,retrievedAt:cutoff,httpStatus:response.status,contentType:[response.headers.get("content-type")],byteLength:bytes.byteLength,sha256:sha(bytes)};
}
sources.documents.push(...await Promise.all([
  sourceDocument("azerbaijan_race","final-session-classification",raceUrl),
  sourceDocument("azerbaijan_qualifying","final-qualifying-classification",qualifyingUrl),
  sourceDocument("azerbaijan_championship_points","snapshot-support",pointsUrl),
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
  ["events.Count 20","events.Count 21"],[") 14 'completed races'",") 15 'completed races'"],[") 423 'completed classification and reconciliation rows'",") 445 'completed classification and reconciliation rows'"],
  ["qualifying_events.Count 14","qualifying_events.Count 15"],[") 308 'qualifying rows'",") 330 'qualifying rows'"],["remainingSessions.Count 10","remainingSessions.Count 9"],["documents.Count 39","documents.Count 42"],
  ["$classifiedDnfs.Count 6","$classifiedDnfs.Count 7"],
  ["'Oliver Bearman:17')","'Oliver Bearman:17','Valtteri Bottas:16')"]
]) { if (!validator.includes(from)) throw new Error(`Validator pattern not found: ${from}`); validator=validator.replace(from,to); }
validator=validator.replace("Write-Output 'PASS: frozen dataset is internally consistent and matches the stored standings totals.'",`
$spainRaceLawson = ($results.events | Where-Object { $_.event -eq 'spain_madrid' -and $_.session -eq 'race' }).rows | Where-Object driver -eq 'Liam Lawson'
$spainQualifyingLawson = ($countback.qualifying_events | Where-Object event -eq 'spain_madrid').rows | Where-Object driver -eq 'Liam Lawson'
Assert-Equal $spainRaceLawson.constructor 'Oracle Red Bull Racing' 'Spain race Lawson team correction'
Assert-Equal $spainQualifyingLawson.constructor 'Oracle Red Bull Racing' 'Spain qualifying Lawson team correction'
Assert-Equal (($manifest.driverStandings | Where-Object driver -eq 'Esteban Ocon').position) 16 'FIA Ocon rank on seven points'
Assert-Equal (($manifest.driverStandings | Where-Object driver -eq 'Carlos Sainz').position) 17 'FIA Sainz rank on seven points'
Assert-Equal (($manifest.constructorStandings | Where-Object constructor -eq 'Oracle Red Bull Racing').points) 263 'FIA Red Bull points'
Assert-Equal (($manifest.constructorStandings | Where-Object constructor -eq 'Visa Cash App Racing Bulls F1 Team').points) 83 'FIA Racing Bulls points'

Write-Output 'PASS: frozen dataset is internally consistent and matches the stored standings totals.'`);
writeFileSync(validatorPath,validator);
writeFileSync(resolve(newDir,"README.md"),`# Frozen 2026 Formula 1 data\n\nSnapshot through the Azerbaijan Grand Prix at **2026-09-27 09:46:00 IST (UTC+05:30)**.\n\nThe Azerbaijan race and qualifying classifications come from FIA Docs 71 and 51. The driver and constructor standings match FIA Doc 72. This version also corrects Lawson's team in the Spain race and qualifying records to Oracle Red Bull Racing, as shown in those FIA classifications. The Azerbaijan race classification is subject to ongoing routine technical checks, and Doc 72 notes an Italian Grand Prix appeal. Any later change requires a new snapshot. Earlier snapshots remain intact.\n\nRun \`powershell -NoProfile -ExecutionPolicy Bypass -File data/frozen/2026-09-27/validate.ps1\` from \`v1\`.\n`);
const roster=manifest.futureLineup.flatMap(({constructor,drivers})=>drivers.map((driverId)=>({driverId,constructorId:constructor})));
const sessions=manifest.remainingSessions.map(({date,event,type},sequenceIndex)=>({id:`${date}:${event}:${type}`,session:type,sequenceIndex}));
const driverIds=new Set(roster.map(({driverId})=>driverId));
const constructorIds=new Set(roster.map(({constructorId})=>constructorId));
const relevant={dataVersion:manifest.dataVersion,ruleVersion:manifest.ruleVersion,roster,sessions,scoring:{race:manifest.scoring.race,sprint:manifest.scoring.sprint},
  standings:[...driverIds].sort().map((id)=>({id,points:results.driver_standings[id],race:countback.driver_race_finish_histograms[id],qualifying:countback.driver_qualifying_position_histograms[id]})),
  constructorStandings:[...constructorIds].sort().map((id)=>({id,points:results.constructor_standings[id],race:countback.constructor_race_finish_histograms[id],qualifying:countback.constructor_qualifying_position_histograms[id]}))};
console.log(JSON.stringify({dataVersion:cutoff,manifestSha256:sha(readFileSync(resolve(newDir,"manifest.json"))),artifactSha256:{"session-results.json":manifest.artifacts.sessionResults.sha256,"countback.json":manifest.artifacts.countback.sha256,"source-documents.json":manifest.artifacts.sourceDocuments.sha256},snapshotFingerprint:`sha256-${sha(canonical(relevant)).toLowerCase()}`},null,2));
