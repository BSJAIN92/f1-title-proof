import { expect, test } from "@playwright/test";
import path from "node:path";

const artifacts = path.join(process.cwd(), "artifacts", "convex-history");
const binding = {
  dataVersion: "2026-09-01T21:14:22+05:30",
  ruleVersion: "fia-2026-section-a-issue-03_section-b-issue-08_v1-full-points",
};

test("driver proof, anonymous cookie, Convex history, secure reopen, focus and overflow", async ({ page, context }, testInfo) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Drivers" })).toBeFocused();
  expect(await page.getByRole("button", { name: "Drivers" }).evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  const choice = page.getByRole("button", { name: /Kimi Antonelli/ });
  await choice.click();
  await page.getByRole("button", { name: "Calculate exact path" }).click();
  await expect(page.getByRole("heading", { name: /The proof for Kimi Antonelli/ })).toBeVisible();
  await expect(page.getByText("These groups are disjoint; no winning path is counted twice.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reopen Kimi Antonelli calculation" })).toHaveCount(1);
  const before = await page.evaluate(async () => (await fetch("/api/state")).json());
  expect(before.history).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: /The proof for Kimi Antonelli/ })).toBeVisible();
  const after = await page.evaluate(async () => (await fetch("/api/state")).json());
  expect(after.history).toHaveLength(1);
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 });
  const cookie = (await context.cookies()).find((item) => item.name === "titleproof_anon");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", secure: true });
  expect(cookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: path.join(artifacts, `${testInfo.project.name}-proof-history.png`), fullPage: true });
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: /Back to standings/ }).click();
    await expect(choice).toBeVisible();
    await expect(choice).toHaveAttribute("aria-current", "true");
  }
});

test("constructor selection calculates and records authentic proof", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Constructors" }).click();
  await page.getByRole("button", { name: /Mercedes-AMG PETRONAS/ }).click();
  await page.getByRole("button", { name: "Calculate exact path" }).click();
  await expect(page.getByRole("heading", { name: /The proof for Mercedes-AMG PETRONAS/ })).toBeVisible();
  await expect(page.locator(".relationship")).toContainText("DISJOINT");
  await expect(page.getByRole("button", { name: /Reopen Mercedes-AMG PETRONAS/ })).toHaveCount(1);
});

test("history shows only newest 20 and reopening does not create a duplicate", async ({ page }) => {
  await page.goto("/");
  const statuses = await page.evaluate(async ({ dataVersion, ruleVersion }) => {
    const values: number[] = [];
    for (let index = 0; index < 21; index += 1) {
      const response = await fetch("/api/calculate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "driver", contenderId: "Kimi Antonelli", dataVersion, ruleVersion }) });
      values.push(response.status);
    }
    return values;
  }, binding);
  expect(statuses.every((status) => status === 200)).toBe(true);
  await page.reload();
  const rows = page.locator(".history-list li");
  await expect(rows).toHaveCount(20);
  const before = await page.evaluate(async () => (await fetch("/api/state")).json());
  await page.getByRole("button", { name: "Reopen Kimi Antonelli calculation" }).first().click();
  await expect(page.getByRole("heading", { name: /The proof for Kimi Antonelli/ })).toBeVisible();
  const after = await page.evaluate(async () => (await fetch("/api/state")).json());
  expect(after.history.map((entry: { id: string }) => entry.id)).toEqual(before.history.map((entry: { id: string }) => entry.id));
});

test("another anonymous browser cannot reopen an owned entry", async ({ page, browser }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Kimi Antonelli/ }).click();
  await page.getByRole("button", { name: "Calculate exact path" }).click();
  await expect(page.getByRole("button", { name: "Reopen Kimi Antonelli calculation" })).toBeVisible();
  const state = await page.evaluate(async () => (await fetch("/api/state")).json());
  const outsider = await browser.newContext();
  const outsiderPage = await outsider.newPage();
  await outsiderPage.goto("/");
  const status = await outsiderPage.evaluate(async (historyId) => (await fetch("/api/reopen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ historyId }) })).status, state.history[0].id);
  expect(status).toBe(404);
  await outsider.close();
});

test("malformed requests and stale returned proof are rejected", async ({ page, request }) => {
  const malformed = await request.post("/api/calculate", { data: { kind: "driver" } });
  expect(malformed.status()).toBe(400);
  expect(await malformed.json()).toEqual({ reason: "The calculation request is malformed." });
  await page.route("**/api/calculate", (route) => route.fulfill({ json: { status: "COMPLETE", kind: "driver", contenderId: "Kimi Antonelli", dataVersion: "stale", ruleVersion: binding.ruleVersion, rule: "FORGED RESULT", groups: [{ id: "POINTS_AHEAD", description: "x" }, { id: "COUNTBACK_WIN", description: "y" }], groupRelationship: { behavior: "DISJOINT", uniqueUnion: true, statement: "x" }, samples: [] } }));
  await page.goto("/");
  await page.getByRole("button", { name: /Kimi Antonelli/ }).click();
  await page.getByRole("button", { name: "Calculate exact path" }).click();
  await expect(page.getByRole("heading", { name: "Stale result rejected" })).toBeVisible();
  await expect(page.getByText("FORGED RESULT")).toHaveCount(0);
});

test("native disclosures expose setup and replay evidence by keyboard", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Kimi Antonelli/ }).click();
  const setup = page.locator(".setup details");
  const setupSummary = setup.locator("summary");
  await setupSummary.focus();
  await page.keyboard.press("Enter");
  await expect(setup).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(setup).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Calculate exact path" }).click();
  const replay = page.locator(".sample-rail details").first();
  const replaySummary = replay.locator("summary");
  await replaySummary.focus();
  await page.keyboard.press("Enter");
  await expect(replay.locator("li")).toHaveCount(12);
  expect(await replaySummary.evaluate((element) => getComputedStyle(element, "::before").content)).toContain("−");
});
