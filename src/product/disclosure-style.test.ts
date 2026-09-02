import {describe,expect,it} from "vitest";import {readFileSync} from "node:fs";
const css=readFileSync(new URL("../../app/globals.css",import.meta.url),"utf8");
describe("native disclosure indicator",()=>{it("shows distinct closed and open states without replacing details semantics",()=>{expect(css).toContain('summary::before{content:"+"');expect(css).toContain('details[open]>summary::before{content:"−"');expect(css).toContain("summary:focus-visible")})});
