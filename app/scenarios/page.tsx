import { GuaranteedScenariosWorkbench } from "../../src/components/guaranteed-scenarios-workbench";
import { loadActiveProductData } from "../../src/server/convex-store";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  let data;
  try { data = await loadActiveProductData(); }
  catch { return <main className="service-unavailable"><p className="eyebrow">Formula 1 Championship · service status</p><h1>Approved data unavailable</h1><p>The scenarios page cannot reach its approved Convex dataset.</p><p>Retry when the data service is available.</p></main>; }
  return <GuaranteedScenariosWorkbench data={data}/>;
}
