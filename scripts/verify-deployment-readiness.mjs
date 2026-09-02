import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const failures = [];
for (const name of ["convex/schema.ts", "convex/datasets.ts", "convex/history.ts", "convex/serverAccess.ts", "vercel.json", ".env.example"]) {
  if (!existsSync(join(root, name))) failures.push(`Missing ${name}`);
}

const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
if (!String(vercel.buildCommand).includes("convex deploy") || !String(vercel.buildCommand).includes("NEXT_PUBLIC_CONVEX_URL")) failures.push("Vercel build command does not deploy Convex and bind its URL.");
const envExample = readFileSync(join(root, ".env.example"), "utf8");
for (const name of ["CONVEX_SERVER_CREDENTIAL", "CONVEX_SEED_CREDENTIAL"]) {
  if (!envExample.includes(`${name}=`)) failures.push(`.env.example is missing ${name}.`);
  if (envExample.includes(`NEXT_PUBLIC_${name}`)) failures.push(`${name} must not be exposed to browser code.`);
}
for (const name of ["convex/datasets.ts", "convex/history.ts"]) {
  const source = readFileSync(join(root, name), "utf8");
  if (!source.includes("requireServerCredential")) failures.push(`${name} does not enforce the server credential.`);
}
if (!readFileSync(join(root, "convex/seedNode.ts"), "utf8").includes("requireDeploymentCredential")) failures.push("The seed action is not deployment-authorized.");

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" || entry.name === "_generated" ? [] : sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

for (const file of [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "src"))]) {
  const source = readFileSync(file, "utf8");
  if (source.includes("localStorage") || source.includes("sessionStorage")) failures.push(`${relative(root, file)} uses browser storage.`);
  if (source.includes("data/frozen") || source.includes("readFileSync") || source.includes("process.cwd()")) failures.push(`${relative(root, file)} reads build-time frozen files at runtime.`);
}

if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Deployment source checks passed: Convex-only live storage, no browser or frozen-file runtime fallback.\n");
}
