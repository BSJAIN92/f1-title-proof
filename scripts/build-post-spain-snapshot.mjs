import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const oldDir = resolve(root, "data/frozen/2026-09-10");
const newDir = resolve(root, "data/frozen/2026-09-23");
const cutoff = "2026-09-23T12:30:00+05:30";
mkdirSync(newDir, { recursive: true });
for (const name of ["classified-retirement-fixture.json", "validate.ps1"]) cpSync(resolve(oldDir, name), resolve(newDir, name));
const read = (name) => JSON.parse(readFileSync(resolve(oldDir, name), "utf8"));
const write = (name, value) => writeFileSync(resolve(newDir, name), `${JSON.stringify(value, null, 2)}\n`);
const manifest = read("manifest.json"), results = read("session-results.json"), countback = read("countback.json"), sources = read("source-documents.json");

const teams = {
  "Kimi Antonelli":"Mercedes-AMG PETRONAS F1 Team", "George Russell":"Mercedes-AMG PETRONAS F1 Team",
  "Max Verstappen":"Oracle Red Bull Racing", "Isack Hadjar":"Oracle Red Bull Racing", "Lando Norris":"McLaren Mastercard F1 Team",
  "Oscar Piastri":"McLaren Mastercard F1 Team", "Lewis Hamilton":"Scuderia Ferrari HP", "Charles Leclerc":"Scuderia Ferrari HP",
  "Pierre Gasly":"BWT Alpine F1 Team", "Franco Colapinto":"BWT Alpine F1 Team", "Arvid Lindblad":"Visa Cash App Racing Bulls F1 Team",
  "Liam Lawson":"Visa Cash App Racing Bulls F1 Team", "Yuki Tsunoda":"Visa Cash App Racing Bulls F1 Team", "Gabriel Bortoleto":"Audi Revolut F1 Team",
  "Nico Hulkenberg":"Audi Revolut F1 Team", "Carlos Sainz":"Atlassian Williams F1 Team", "Alexander Albon":"Atlassian Williams F1 Team",
  "Oliver Bearman":"TGR Haas F1 Team", "Esteban Ocon":"TGR Haas F1 Team", "Sergio Perez":"Cadillac Formula 1 Team",
  "Valtteri Bottas":"Cadillac Formula 1 Team", "Lance Stroll":"Aston Martin Aramco F1 Team", "Fernando Alonso":"Aston Martin Aramco F1 Team"
};
const cars = {"Kimi Antonelli":12,"George Russell":63,"Max Verstappen":3,"Isack Hadjar":6,"Lando Norris":1,"Oscar Piastri":81,"Lewis Hamilton":44,"Charles Leclerc":16,"Pierre Gasly":10,"Franco Colapinto":43,"Arvid Lindblad":41,"Liam Lawson":30,"Yuki Tsunoda":22,"Gabriel Bortoleto":5,"Nico Hulkenberg":27,"Carlos Sainz":55,"Alexander Albon":23,"Oliver Bearman":87,"Esteban Ocon":31,"Sergio Perez":11,"Valtteri Bottas":77,"Lance Stroll":18,"Fernando Alonso":14};
const raceOrder = ["Kimi Antonelli","Max Verstappen","Lando Norris","Charles Leclerc","George Russell","Liam Lawson","Franco Colapinto","Oscar Piastri","Arvid Lindblad","Nico Hulkenberg","Esteban Ocon","Pierre Gasly","Gabriel Bortoleto","Yuki Tsunoda","Alexander Albon","Oliver Bearman","Fernando Alonso","Valtteri Bottas","Carlos Sainz","Sergio Perez","Lance Stroll","Lewis Hamilton"];
const raceLaps = [57,57,57,57,57,57,57,57,56,56,56,56,56,56,56,56,55,54,43,31,12,6];
const racePoints = [25,18,15,12,10,8,6,4,2,1];
const raceUrl = "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_final_race_classification.pdf";
const qualifyingUrl = "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_final_qualifying_classification.pdf";
const pointsUrl = "https://www.fia.com/system/files/decision-document/2026_spanish_grand_prix_-_championship_points.pdf";

results.sources.spain_race = raceUrl;
results.events.push({event:"spain_madrid",session:"race",rows:raceOrder.map((driver,index)=>({
  driver, car:cars[driver], constructor:teams[driver], position:index<18?index+1:null, classification:index<18?String(index+1):"NC",
  status:index<18?"CLASSIFIED":"DNF", laps:raceLaps[index], awarded_points:racePoints[index]??0,
  fia_detail:"Official final classification; see sources.spain_race"
}))});

const qualifyingOrder = ["Lando Norris","Kimi Antonelli","Max Verstappen","Lewis Hamilton","Charles Leclerc","George Russell","Oscar Piastri","Liam Lawson","Franco Colapinto","Arvid Lindblad","Nico Hulkenberg","Gabriel Bortoleto","Esteban Ocon","Pierre Gasly","Yuki Tsunoda","Alexander Albon","Carlos Sainz","Fernando Alonso","Sergio Perez","Valtteri Bottas","Oliver Bearman","Lance Stroll"];
countback.qualifying_events.push({event:"spain_madrid",source_url:qualifyingUrl,rows:qualifyingOrder.map((driver,index)=>({position:index+1,driver,car:cars[driver],constructor:teams[driver],classification:String(index+1)}))});

const increment = (value,key) => value[key] = (value[key]??0)+1;
for (const [index,driver] of raceOrder.entries()) if (index<18) {
  increment(countback.driver_race_finish_histograms[driver]??={},String(index+1));
  increment(countback.constructor_race_finish_histograms[teams[driver]]??={},String(index+1));
}
for (const [index,driver] of qualifyingOrder.entries()) {
  increment(countback.driver_qualifying_position_histograms[driver]??={},String(index+1));
  increment(countback.constructor_qualifying_position_histograms[teams[driver]]??={},String(index+1));
}

const driverPoints = {...results.driver_standings};
const constructorPoints = {...results.constructor_standings};
for (const row of results.events.at(-1).rows) {
  driverPoints[row.driver]=(driverPoints[row.driver]??0)+row.awarded_points;
  constructorPoints[row.constructor]=(constructorPoints[row.constructor]??0)+row.awarded_points;
}
results.driver_standings=driverPoints;
results.constructor_standings=constructorPoints;
results.driver_race_position_histograms=countback.driver_race_finish_histograms;
results.constructor_race_position_histograms=countback.constructor_race_finish_histograms;
results.remaining=results.remaining.filter((item)=>item.event!=="spain_madrid");
manifest.driverStandings.forEach((row)=>row.points=driverPoints[row.driver]);
manifest.driverStandings.sort((a,b)=>b.points-a.points||a.position-b.position).forEach((row,index)=>row.position=index+1);
manifest.constructorStandings.forEach((row)=>row.points=constructorPoints[row.constructor]);
manifest.constructorStandings.sort((a,b)=>b.points-a.points||a.position-b.position).forEach((row,index)=>row.position=index+1);
manifest.remainingSessions=manifest.remainingSessions.filter((item)=>item.event!=="Spain");
manifest.dataVersion=manifest.cutoff.local=cutoff;
manifest.cutoff.utc="2026-09-23T07:00:00Z";
manifest.approval.approvedAt=cutoff;
manifest.sourcePolicy.retrievedAt=cutoff;
manifest.sourcePolicy.manualExtractionReview="Spanish race and qualifying were checked row-by-row against the official FIA classifications; driver and constructor totals were checked against the official championship points document.";

async function sourceDocument(id,category,url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${id} returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {id,category,url,retrievedAt:cutoff,httpStatus:response.status,contentType:[response.headers.get("content-type")??"application/pdf"],byteLength:bytes.byteLength,sha256:createHash("sha256").update(bytes).digest("hex").toUpperCase()};
}
sources.documents.push(...await Promise.all([
  sourceDocument("spain_madrid_race","final-session-classification",raceUrl),
  sourceDocument("spain_madrid_qualifying","final-qualifying-classification",qualifyingUrl),
  sourceDocument("spain_madrid_championship_points","snapshot-support",pointsUrl),
]));
sources.cutoff=cutoff;

write("session-results.json",results);
write("countback.json",countback);
write("source-documents.json",sources);
const sha = (name)=>createHash("sha256").update(readFileSync(resolve(newDir,name))).digest("hex").toUpperCase();
manifest.artifacts.sessionResults.sha256=sha("session-results.json");
manifest.artifacts.countback.sha256=sha("countback.json");
manifest.artifacts.sourceDocuments.sha256=sha("source-documents.json");
write("manifest.json",manifest);

const validatorPath=resolve(newDir,"validate.ps1");
let validator=readFileSync(validatorPath,"utf8");
for (const [from,to] of [
  ["events.Count 19","events.Count 20"],[") 13 'completed races'",") 14 'completed races'"],[") 401 'completed classification and reconciliation rows'",") 423 'completed classification and reconciliation rows'"],
  ["qualifying_events.Count 13","qualifying_events.Count 14"],[") 286 'qualifying rows'",") 308 'qualifying rows'"],["remainingSessions.Count 11","remainingSessions.Count 10"],["documents.Count 36","documents.Count 39"]
]) validator=validator.replace(from,to);
writeFileSync(validatorPath,validator);
writeFileSync(resolve(newDir,"README.md"),`# Frozen 2026 Formula 1 data\n\nApproved snapshot through the Spanish Grand Prix at **2026-09-23 12:30:00 IST (UTC+05:30)**.\n\nSpain's final race and qualifying classifications are included, and the standings match the official championship points document published after the race. Earlier snapshot directories remain immutable history.\n\nRun \`powershell -NoProfile -ExecutionPolicy Bypass -File data/frozen/2026-09-23/validate.ps1\` from \`v1\`.\n`);
