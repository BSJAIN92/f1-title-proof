import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("deployment configuration", () => {
  it("keeps generated and secret state out of source control", () => {
    const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");
    expect(gitignore).toContain(".env*");
    expect(gitignore).toContain("!.env.example");
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".next/");
    expect(gitignore).toContain(".convex/");
    expect(gitignore).toContain(".vercel/");
  });

  it("deploys Convex before Vercel builds Next", () => {
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"));
    expect(vercel.buildCommand).toContain("convex deploy");
    expect(vercel.buildCommand).toContain("NEXT_PUBLIC_CONVEX_URL");
  });
});
