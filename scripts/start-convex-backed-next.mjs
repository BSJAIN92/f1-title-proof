import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error("NEXT_PUBLIC_CONVEX_URL is missing. Configure a local Convex deployment first.");
const nextPort = process.env.TITLEPROOF_PORT ?? "3100";
if (!/^\d{2,5}$/.test(nextPort)) throw new Error("TITLEPROOF_PORT must be a valid port number.");
const children = new Set();
process.env.CONVEX_SERVER_CREDENTIAL ||= randomBytes(32).toString("base64url");
process.env.CONVEX_SEED_CREDENTIAL ||= randomBytes(32).toString("base64url");

function start(program, args) {
  const child = process.platform === "win32"
    ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [program, ...args].join(" ")], { stdio: "inherit", env: process.env, windowsHide: true })
    : spawn(program, args, { stdio: "inherit", env: process.env });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function run(program, args) {
  return new Promise((resolve, reject) => {
    const child = start(program, args);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${program} exited with code ${code}.`)));
    child.once("error", reject);
  });
}

function startDirect(program, args) {
  const child = spawn(program, args, { stdio: "inherit", env: process.env, windowsHide: true });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

async function reachable() {
  try { await fetch(convexUrl); return true; } catch { return false; }
}

async function setLocalConvexEnvironment(changes) {
  const config = JSON.parse(await readFile(".convex/local/default/config.json", "utf8"));
  if (!Number.isInteger(config?.ports?.cloud) || typeof config?.adminKey !== "string" || !config.adminKey) throw new Error("The local Convex admin configuration is invalid.");
  const localUrl = new URL(convexUrl);
  if (!(["127.0.0.1", "localhost"].includes(localUrl.hostname)) || Number(localUrl.port) !== config.ports.cloud) throw new Error("The local Convex URL does not match its admin configuration.");
  const response = await fetch(new URL("/api/update_environment_variables", localUrl), {
    method: "POST",
    headers: { Authorization: `Convex ${config.adminKey}`, "Content-Type": "application/json", "Convex-Client": "title-proof-test-launcher" },
    body: JSON.stringify({ changes }),
  });
  if (!response.ok) throw new Error(`The local Convex environment update failed with status ${response.status}.`);
}

async function waitForConvex() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await reachable()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The local Convex backend did not become reachable within 60 seconds.");
}

let startedConvex = false;
if (!await reachable()) {
  startDirect(process.execPath, ["node_modules/convex/bin/main.js", "dev", "--typecheck", "disable", "--tail-logs", "disable"]);
  startedConvex = true;
}
await waitForConvex();
await setLocalConvexEnvironment([
  { name: "CONVEX_SERVER_CREDENTIAL", value: process.env.CONVEX_SERVER_CREDENTIAL },
  { name: "CONVEX_SEED_CREDENTIAL", value: process.env.CONVEX_SEED_CREDENTIAL },
]);
await run("npm", ["run", "convex:migrate-comparison-ids"]);
await run("npm", ["run", "convex:seed"]);
await run("npm", ["run", "test:convex:security"]);

const next = start("npm", ["run", "start", "--", "-p", nextPort]);
const shutdown = () => {
  next.kill();
  if (startedConvex) for (const child of children) child.kill();
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
next.once("exit", (code) => { shutdown(); process.exitCode = code ?? 1; });
