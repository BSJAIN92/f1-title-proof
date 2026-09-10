import { expect, test } from "@playwright/test";

test("loads driver scenarios and another page", async ({ page }, testInfo) => {
  await page.goto("/scenarios");
  await expect(page.getByRole("heading", { name:"Possible championship scenarios" })).toBeVisible();
  await page.getByRole("button", { name:/Select Kimi Antonelli/ }).click();
  await expect(page.getByRole("heading", { name:"Kimi Antonelli", exact:true })).toBeVisible({ timeout:15_000 });
  await expect(page.locator(".guarantee-card")).toHaveCount(25);
  const firstPoints = await page.locator(".guarantee-card").first().locator("header strong").first().textContent();
  await page.getByRole("button", { name:"Load 25 more scenarios" }).click();
  await expect(page.locator(".guarantee-card")).toHaveCount(50, { timeout:15_000 });
  expect(await page.locator(".guarantee-card").first().locator("header strong").first().textContent()).toBe(firstPoints);
  await page.screenshot({ path:testInfo.outputPath("scenarios-driver.png"), fullPage:false });
});

test("switches to constructor scenarios", async ({ page }, testInfo) => {
  await page.goto("/scenarios");
  await page.getByRole("button", { name:"Constructors" }).click();
  await page.getByRole("button", { name:/Select Mercedes-AMG PETRONAS F1 Team/ }).click();
  await expect(page.getByRole("heading", { name:"Mercedes-AMG PETRONAS F1 Team", exact:true })).toBeVisible({ timeout:15_000 });
  await expect(page.locator(".guarantee-card")).toHaveCount(25);
  await expect(page.locator(".finish-chips").first()).toContainText("+");
  await page.screenshot({ path:testInfo.outputPath("scenarios-constructor.png"), fullPage:false });
});

test("keeps the mobile page within the viewport", async ({ page }, testInfo) => {
  await page.goto("/scenarios");
  await page.getByRole("button", { name:/Select Kimi Antonelli/ }).click();
  await expect(page.locator(".guarantee-card")).toHaveCount(25, { timeout:15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
  await page.screenshot({ path:testInfo.outputPath("scenarios-mobile.png"), fullPage:false });
});
