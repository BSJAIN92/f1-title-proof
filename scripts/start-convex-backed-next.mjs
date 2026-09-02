import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

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

function runHidden(program, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: "ignore", env: process.env, windowsHide: true });
    children.add(child);
    child.once("exit", (code) => {
      children.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`${program} exited with code ${code}.`));
    });
    child.once("error", reject);
  });
}

async function reachable() {
  try { await fetch(convexUrl); return true; } catch { return false; }
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
  start("npx", ["convex", "dev", "--typecheck", "disable", "--tail-logs", "disable"]);
  startedConvex = true;
}
await waitForConvex();
await runHidden(process.execPath, ["node_modules/convex/bin/main.js", "env", "set", `CONVEX_SERVER_CREDENTIAL=${process.env.CONVEX_SERVER_CREDENTIAL}`]);
await runHidden(process.execPath, ["node_modules/convex/bin/main.js", "env", "set", `CONVEX_SEED_CREDENTIAL=${process.env.CONVEX_SEED_CREDENTIAL}`]);
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
