import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

function deepSave(stage: number, level = 0) {
  const raw = JSON.parse(fixture("prestige"));
  raw.meta.prestigeCount = 16;
  raw.meta.deepMasteryLevel = level;
  raw.run.targetStage = Math.max(800, stage);
  raw.run.routeClears = 5 * (stage - 1) + 1;
  raw.run.highestClearedStage = stage;
  raw.run.clears = String(raw.run.routeClears);
  raw.stats.totalClears = raw.run.clears;
  raw.stats.highestStage = stage;
  raw.automation.atkEnabled = false;
  raw.automation.autoAdvanceEnabled = true;
  return JSON.stringify(raw);
}

test("Prestige sheet separates escape from Deep rewards, applies only on reset and roundtrips", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto("./");
  async function importSave(text: string) {
    await page.getByRole("button", { name: "設定・Save" }).click();
    await page.getByLabel("Save JSON", { exact: true }).fill(text);
    await page
      .getByRole("button", { name: "Importを確認", exact: true })
      .click();
    await page
      .getByRole("button", { name: "このSaveをImport", exact: true })
      .click();
  }
  await importSave(deepSave(800));
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expect(page.getByText("PRESTIGE READY", { exact: true })).toBeVisible();
  await expect(page.locator(".soul-banner")).toContainText("今回 +90 SOUL");
  const panel = page.getByTestId("deep-mastery");
  await expect(panel).toContainText("Current Deep MASTERY Lv0");
  await expect(panel).toContainText("Stage 850 CLEAR");
  await expect(panel).toContainText("今回のDeep MASTERY追加なし");
  await expect(page.getByRole("dialog")).not.toContainText("毎Prestige");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await importSave(deepSave(950));
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expect(page.getByText("PRESTIGE READY", { exact: true })).toBeVisible();
  await expect(panel).toContainText("Current Deep MASTERY Lv0");
  await expect(panel).toContainText("Deep MASTERY +3 → Lv3");
  await expect(panel).toContainText("Next Deep MASTERY: Stage 1000 CLEAR");
  await expect(page.getByRole("dialog")).toContainText(
    "現在の累積倍率 ×0.06013",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "次Prestigeの累積倍率 ×0.04097",
  );
  await page.getByRole("button", { name: "Prestigeする", exact: true }).click();
  await page
    .getByRole("button", { name: "ResetしてPrestigeを確定", exact: true })
    .click();
  await expect(panel).toContainText("Current Deep MASTERY Lv3");
  await expect(panel).toContainText("Stage 1000 CLEAR");
  await expect(panel).toContainText("今回のDeep MASTERY追加なし");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(
    page.getByText("STAGE / TARGET 800", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("AUTO ADVANCE", { exact: true })).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "設定・Save" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SaveをExport", exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Export missing");
  const text = readFileSync(path, "utf8"),
    saved = JSON.parse(text);
  expect(saved.balanceVersion).toBe("speed-6");
  expect(saved.meta.deepMasteryLevel).toBe(3);
  expect(saved.meta.prestigeCount).toBe(17);
  expect(saved.run.targetStage).toBe(800);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await importSave(text);
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expect(panel).toContainText("Current Deep MASTERY Lv3");
  await page.screenshot({
    path: info.outputPath("deep-mastery.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  expect(
    (await page.locator(".control-panel").boundingBox())?.height,
  ).toBeLessThanOrEqual(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
