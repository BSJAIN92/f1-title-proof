import { ScenarioWorkbench } from "../src/components/scenario-workbench";
import { loadActiveProductData } from "../src/server/convex-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  let data;
  try { data = await loadActiveProductData(); }
  catch {
    return <main className="service-unavailable"><p className="eyebrow">Title proof · service status</p><h1>Approved data unavailable</h1><p>The proof desk cannot reach its approved Convex dataset. No bundled or browser-stored data has been substituted.</p><p>Retry when the data service is available.</p></main>;
  }
  return <ScenarioWorkbench data={data} />;
}
