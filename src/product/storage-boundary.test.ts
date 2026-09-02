import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("browser storage boundary", () => {
  it("keeps application persistence out of browser storage", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/scenario-workbench.tsx"), "utf8");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).toContain("/api/state");
    expect(source).toContain("/api/selection");
    expect(source).toContain("/api/reopen");
  });
});
