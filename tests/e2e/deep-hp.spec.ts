import { expect, test } from "@playwright/test";
import { encode } from "../../src/game/save";
import { prestige17State } from "../fixtures";

test("reported P17 state reaches required Stage850 in under two minutes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto("./");
  await page.getByRole("button", { name: "設定・Save" }).click();
  await page
    .getByLabel("Save JSON", { exact: true })
    .fill(encode(prestige17State()));
  await page.getByRole("button", { name: "Importを確認", exact: true }).click();
  await page
    .getByRole("button", { name: "このSaveをImport", exact: true })
    .click();
  await expect(page.getByTestId("stage")).toHaveText("807");
  await expect(page.getByLabel("AUTO ADVANCE", { exact: true })).toBeChecked();
  await page.clock.runFor(85000);
  const saved = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("loop-breaker.current"))) ??
      "{}",
  );
  expect(saved.balanceVersion).toBe("speed-6");
  expect(saved.run.highestClearedStage).toBeGreaterThanOrEqual(850);
  expect(saved.run.targetStage).toBeGreaterThanOrEqual(875);
  expect(saved.meta.prestigeCount).toBe(17);
  expect(saved.run.upgrades.delay).toBe(6);
  expect(saved.automation.autoAdvanceEnabled).toBe(true);
  expect(
    (await page.locator(".control-panel").boundingBox())?.height,
  ).toBeLessThanOrEqual(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel("AUTO ADVANCE", { exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});
