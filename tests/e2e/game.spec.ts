import { expect, type Page, test } from "@playwright/test";
import { fixture } from "../fixtures";

const pageErrors = new WeakMap<Page, Error[]>();

async function importSave(page: Page, text: string) {
  await page.getByRole("button", { name: "設定・Save" }).click();
  await page.getByLabel("Save JSON", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Importを確認", exact: true }).click();
  await page
    .getByRole("button", { name: "このSaveをImport", exact: true })
    .click();
}
test.beforeEach(async ({ page }) => {
  const errors: Error[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error));
  await page.clock.install();
  await page.goto("./");
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});
test("runs automatically and pauses hidden time without offline catch-up", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "LOOPBREAKER" }),
  ).toBeVisible();
  await page.clock.runFor(6000);
  await expect(page.getByTestId("clears")).toHaveText("1");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(120000);
  await expect(page.getByTestId("clears")).toHaveText("1");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(1000);
  await expect(page.getByTestId("clears")).toHaveText("1");
  await page.reload();
  await expect(page.getByTestId("clears")).toHaveText("1");
  await expect(page.getByTestId("gold")).toHaveText("10");
});
test("supports purchases, all upgrades, mobile fit and Save export/import", async ({
  page,
}, testInfo) => {
  await importSave(page, fixture());
  await page.getByTestId("buy-atk").click();
  await expect(page.getByTestId("buy-atk")).toContainText("Lv 1");
  await page.getByRole("button", { name: "UPGRADES" }).click();
  await expect(page.getByTestId("buy-speed")).toContainText("6 CLEARで解禁");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByTestId("clear-time")).toContainText("4.39");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const bounds = await page.getByTestId("buy-atk").boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(48);
  await page.screenshot({
    path: testInfo.outputPath("battle.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "設定・Save" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SaveをExport", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("loop-breaker-save.json");
  await page.getByLabel("Save JSON", { exact: true }).fill("{broken");
  await page.getByRole("button", { name: "Importを確認", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});
test("Prestige, SOUL upgrades, mastery and AUTO settings work together", async ({
  page,
}) => {
  await importSave(page, fixture("prestige"));
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expect(
    page.getByRole("heading", { name: "LOOP MASTERY", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Prestigeする", exact: true }).click();
  await page
    .getByRole("button", { name: "ResetしてPrestigeを確定", exact: true })
    .click();
  await expect(
    page.getByText("BREAK I · 全周回時間 ×0.55 / 45%短縮"),
  ).toContainText("獲得済み");
  for (const id of ["POWER", "WEALTH", "TEMPO"])
    await page.getByRole("button", { name: new RegExp(`${id} Lv0`) }).click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(page.getByTestId("stage")).toHaveText("1");
  await expect(page.getByTestId("clear-time")).toContainText("1.76");
  await expect(page.getByLabel("AUTO ATK購入")).toBeChecked();
});
test("BURST displays aggregate results, survives reload and exits at deeper stages", async ({
  page,
}, testInfo) => {
  await importSave(page, fixture("burst"));
  await expect(page.getByText("BURST MODE", { exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("burst.png"),
    fullPage: true,
  });
  await page.clock.runFor(3100);
  await expect(page.getByText(/BURST 5.00 sec · CLEAR/)).toBeVisible();
  await page.getByRole("button", { name: "設定・Save" }).click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await expect(page.getByText("BURST MODE", { exact: true })).toBeVisible();
  const raw = JSON.parse(fixture("burst"));
  raw.run.targetStage = 550;
  raw.run.routeClears = 2745;
  raw.run.clears = "2745";
  raw.run.highestClearedStage = 549;
  raw.stats.totalClears = "2745";
  raw.stats.highestStage = 549;
  await importSave(page, JSON.stringify(raw));
  await page.clock.runFor(200);
  await expect(page.getByText("AUTO BATTLE", { exact: true })).toBeVisible();
});

test("Prestige only displays this cycle's SOUL reward after eligibility", async ({
  page,
}) => {
  await importSave(page, fixture("prestige"));
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await page.getByRole("button", { name: "Prestigeする", exact: true }).click();
  await page
    .getByRole("button", { name: "ResetしてPrestigeを確定", exact: true })
    .click();
  await expect(page.locator(".soul-banner small")).toHaveText(
    "Stage 100 CLEARでPrestige可能",
  );
  await expect(
    page.getByRole("button", { name: "Prestigeする", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();

  const raw = JSON.parse(fixture("prestige"));
  raw.meta.prestigeCount = 1;
  raw.run.routeClears = 495;
  raw.run.clears = "495";
  raw.run.highestClearedStage = 99;
  await importSave(page, JSON.stringify(raw));
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expect(page.getByTestId("stage")).toHaveText("100");
  await expect(page.locator(".soul-banner small")).toHaveText(
    "Stage 100 CLEARでPrestige可能",
  );
  await page.clock.runFor(5000);
  await expect(page.locator(".soul-banner small")).toHaveText("今回 +8 SOUL");
  await expect(
    page.getByRole("button", { name: "Prestigeする", exact: true }),
  ).toBeEnabled();
});

test("deepen unlocks only after each current target CLEAR", async ({
  page,
}) => {
  // At sub-ms speeds even the assertion delay can traverse the new route.
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await importSave(page, fixture("prestige"));
  const deepen = page.getByRole("button", {
    name: "さらに進む +25",
    exact: true,
  });
  await expect(deepen).toHaveCount(0);
  await importSave(page, fixture("burst"));
  await expect(deepen).toBeDisabled();

  const raw = JSON.parse(fixture("burst"));
  raw.run.routeClears = 746;
  raw.run.clears = "100000";
  raw.run.highestClearedStage = 150;
  raw.run.phase = 0;
  raw.stats.totalClears = "100000";
  raw.stats.highestStage = 150;
  raw.automation.atkEnabled = false;
  await importSave(page, JSON.stringify(raw));
  await expect(deepen).toBeEnabled();
  await deepen.click();
  await expect(
    page.getByText("STAGE / TARGET 175", { exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("stage")).toHaveText("150");
  await expect(deepen).toBeDisabled();
  await page.clock.runFor(60000);
  await expect(page.getByTestId("stage")).toHaveText("175");
  await expect(deepen).toBeEnabled();
  await deepen.click();
  await expect(
    page.getByText("STAGE / TARGET 200", { exact: true }),
  ).toBeVisible();
  await expect(deepen).toBeDisabled();
});
