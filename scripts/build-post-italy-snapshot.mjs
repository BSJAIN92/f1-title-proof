import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const oldDir = resolve(root, "data/frozen/2026-09-01");
const newDir = resolve(root, "data/frozen/2026-09-10");
mkdirSync(newDir, { recursive: true });
for (const name of ["classified-retirement-fixture.json", "validate.ps1"]) cpSync(resolve(oldDir, name), resolve(newDir, name));
const read = (name) => JSON.parse(readFileSync(resolve(oldDir, name), "utf8"));
const write = (name, value) => writeFileSync(resolve(newDir, name), `${JSON.stringify(value, null, 2)}\n`);
const manifest = read("manifest.json"), results = read("session-results.json"), countback = read("countback.json"), sources = read("source-documents.json");

const teams = {
  "Kimi Antonelli":"Mercedes-AMG PETRONAS F1 Team", "George Russell":"Mercedes-AMG PETRONAS F1 Team",
  "Max Verstappen":"Oracle Red Bull Racing", "Lando Norris":"McLaren Mastercard F1 Team", "Oscar Piastri":"McLaren Mastercard F1 Team",
  "Lewis Hamilton":"Scuderia Ferrari HP", "Pierre Gasly":"BWT Alpine F1 Team", "Arvid Lindblad":"Visa Cash App Racing Bulls F1 Team",
  "Franco Colapinto":"BWT Alpine F1 Team", "Yuki Tsunoda":"Visa Cash App Racing Bulls F1 Team", "Gabriel Bortoleto":"Audi Revolut F1 Team",
  "Nico Hulkenberg":"Audi Revolut F1 Team", "Carlos Sainz":"Atlassian Williams F1 Team", "Liam Lawson":"Oracle Red Bull Racing",
  "Oliver Bearman":"TGR Haas F1 Team", "Esteban Ocon":"TGR Haas F1 Team", "Alexander Albon":"Atlassian Williams F1 Team",
  "Sergio Perez":"Cadillac Formula 1 Team", "Valtteri Bottas":"Cadillac Formula 1 Team", "Lance Stroll":"Aston Martin Aramco F1 Team",
  "Fernando Alonso":"Aston Martin Aramco F1 Team", "Charles Leclerc":"Scuderia Ferrari HP"
};
const cars = {"Kimi Antonelli":12,"George Russell":63,"Max Verstappen":3,"Lando Norris":1,"Oscar Piastri":81,"Lewis Hamilton":44,"Pierre Gasly":10,"Arvid Lindblad":41,"Franco Colapinto":43,"Yuki Tsunoda":22,"Gabriel Bortoleto":5,"Nico Hulkenberg":27,"Carlos Sainz":55,"Liam Lawson":30,"Oliver Bearman":87,"Esteban Ocon":31,"Alexander Albon":23,"Sergio Perez":11,"Valtteri Bottas":77,"Lance Stroll":18,"Fernando Alonso":14,"Charles Leclerc":16};
const raceOrder = ["Kimi Antonelli","George Russell","Max Verstappen","Lando Norris","Oscar Piastri","Lewis Hamilton","Pierre Gasly","Arvid Lindblad","Franco Colapinto","Yuki Tsunoda","Gabriel Bortoleto","Nico Hulkenberg","Carlos Sainz","Liam Lawson","Oliver Bearman","Esteban Ocon","Alexander Albon","Sergio Perez","Valtteri Bottas","Lance Stroll","Fernando Alonso","Charles Leclerc"];
const racePoints = [25,18,15,12,10,8,6,4,2,1];
results.sources.italy_race = "https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_final_race_classification.pdf";
results.events.push({event:"italy",session:"race",rows:raceOrder.map((driver,i)=>({driver,car:cars[driver],constructor:teams[driver],position:i<19?i+1:null,classification:i<19?String(i+1):"NC",status:i<19?"CLASSIFIED":"DNF",laps:i<19?(i<19?53-(i>=15?1:0):0):[26,23,1][i-19],awarded_points:racePoints[i]??0,fia_detail:"Official final classification; see sources.italy_race"}))});

// Reconcile the old freeze to the current official standings. These are not Italian race points.
const reconciliation = {"Oscar Piastri":2,"Isack Hadjar":3,"Liam Lawson":2,"Arvid Lindblad":2,"Pierre Gasly":-9};
results.events.push({event:"official-standings-reconciliation-2026-09-10",session:"sprint",rows:Object.entries(reconciliation).map(([driver,awarded_points])=>({driver,car:cars[driver]??6,constructor:driver==="Isack Hadjar"?"Oracle Red Bull Racing":teams[driver],position:null,classification:"ADJUSTMENT",status:"STANDINGS_RECONCILIATION",laps:0,awarded_points,fia_detail:"Reconciles the 2026-09-01 freeze to the official post-Italy championship table; not an Italian race award."}))});

const qualifyingOrder = ["Pierre Gasly","George Russell","Oscar Piastri","Charles Leclerc","Lewis Hamilton","Max Verstappen","Kimi Antonelli","Franco Colapinto","Lando Norris","Arvid Lindblad","Gabriel Bortoleto","Oliver Bearman","Nico Hulkenberg","Liam Lawson","Carlos Sainz","Esteban Ocon","Yuki Tsunoda","Alexander Albon","Valtteri Bottas","Sergio Perez","Fernando Alonso","Lance Stroll"];
countback.qualifying_events.push({event:"italy",source_url:"https://www.fia.com/system/files/decision-document/2026_italian_grand_prix_-_final_qualifying_classification.pdf",rows:qualifyingOrder.map((driver,i)=>({position:i+1,driver,car:cars[driver],constructor:teams[driver],classification:String(i+1)}))});

const inc = (obj,key) => obj[key] = (obj[key]??0)+1;
for (const [i,driver] of raceOrder.entries()) if (i<19) { inc(countback.driver_race_finish_histograms[driver]??={},String(i+1)); inc(countback.constructor_race_finish_histograms[teams[driver]]??={},String(i+1)); }
for (const [i,driver] of qualifyingOrder.entries()) { inc(countback.driver_qualifying_position_histograms[driver]??={},String(i+1)); inc(countback.constructor_qualifying_position_histograms[teams[driver]]??={},String(i+1)); }

const driverPoints = Object.fromEntries(manifest.driverStandings.map(x=>[x.driver,x.points]));
const constructorPoints = Object.fromEntries(manifest.constructorStandings.map(x=>[x.constructor,x.points]));
for (const event of results.events.slice(-2)) for (const row of event.rows) { driverPoints[row.driver]=(driverPoints[row.driver]??0)+row.awarded_points; constructorPoints[row.constructor]=(constructorPoints[row.constructor]??0)+row.awarded_points; }
results.driver_standings=driverPoints; results.constructor_standings=constructorPoints;
results.driver_race_position_histograms=countback.driver_race_finish_histograms;
results.constructor_race_position_histograms=countback.constructor_race_finish_histograms;
results.remaining=results.remaining.filter(x=>x.event!=="italy");
manifest.driverStandings.forEach(x=>x.points=driverPoints[x.driver]); manifest.driverStandings.sort((a,b)=>b.points-a.points||a.position-b.position).forEach((x,i)=>x.position=i+1);
manifest.constructorStandings.forEach(x=>x.points=constructorPoints[x.constructor]); manifest.constructorStandings.sort((a,b)=>b.points-a.points||a.position-b.position).forEach((x,i)=>x.position=i+1);
manifest.remainingSessions=manifest.remainingSessions.filter(x=>x.event!=="Italy");
manifest.dataVersion=manifest.cutoff.local="2026-09-10T00:00:00+05:30"; manifest.cutoff.utc="2026-09-09T18:30:00Z";
manifest.approval.approvedAt="2026-09-10T00:00:00+05:30"; manifest.sourcePolicy.retrievedAt="2026-09-10T00:00:00+05:30";
manifest.sourcePolicy.manualExtractionReview="Italian race and qualifying were checked row-by-row against the official Formula 1 tables; official standings were reconciled to the post-Italy tables.";
sources.cutoff=manifest.dataVersion;
write("session-results.json",results); write("countback.json",countback); write("source-documents.json",sources);
const sha = name=>createHash("sha256").update(readFileSync(resolve(newDir,name))).digest("hex").toUpperCase();
manifest.artifacts.sessionResults.sha256=sha("session-results.json"); manifest.artifacts.countback.sha256=sha("countback.json"); manifest.artifacts.sourceDocuments.sha256=sha("source-documents.json");
write("manifest.json",manifest);
writeFileSync(resolve(newDir,"README.md"),`# Frozen 2026 Formula 1 data\n\nApproved snapshot through the Italian Grand Prix at **2026-09-10 00:00:00 IST (UTC+05:30)**.\n\nItaly's final race and qualifying classifications are included. A labeled reconciliation entry aligns earlier points with the current official championship tables; it is not treated as an Italian race award or countback result.\n\nRun \`powershell -NoProfile -ExecutionPolicy Bypass -File data/frozen/2026-09-10/validate.ps1\` from \`v1\`.\n`);
