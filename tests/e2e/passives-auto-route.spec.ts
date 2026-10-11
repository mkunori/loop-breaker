import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

test("two purchases, free passives, pending Deep growth and AUTO ROUTE roundtrip", async ({
  page,
}, info) => {
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
  await page.getByRole("button", { name: "UPGRADES ↗", exact: true }).click();
  await expect(page.locator(".all-upgrades button")).toHaveCount(2);
  await expect(page.getByTestId("passive-abilities")).toContainText(
    "Attack Speed Lv0",
  );
  for (const id of ["speed", "crit", "overkill"])
    await expect(page.getByTestId(`buy-${id}`)).toHaveCount(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  async function load(stage: number) {
    const raw = JSON.parse(fixture("prestige"));
    raw.meta.prestigeCount = 16;
    raw.run.targetStage = stage;
    raw.run.routeClears = 5 * (stage - 1) + 1;
    raw.run.highestClearedStage = stage;
    raw.run.clears = String(raw.run.routeClears);
    raw.stats.totalClears = raw.run.clears;
    raw.stats.highestStage = stage;
    raw.run.gold = "1e8";
    raw.automation.atkEnabled = true;
    await page.getByRole("button", { name: "設定・Save" }).click();
    await page
      .getByLabel("Save JSON", { exact: true })
      .fill(JSON.stringify(raw));
    await page
      .getByRole("button", { name: "Importを確認", exact: true })
      .click();
    await page
      .getByRole("button", { name: "このSaveをImport", exact: true })
      .click();
  }
  await load(899);
  await page.getByRole("button", { name: "UPGRADES ↗", exact: true }).click();
  await expect(page.getByLabel("AUTO ROUTE", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await load(900);
  await page.getByRole("button", { name: "UPGRADES ↗", exact: true }).click();
  const toggle = page.getByLabel("AUTO ROUTE", { exact: true });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.getByLabel("予約Gold", { exact: true }).fill("1000");
  await page
    .getByRole("button", { name: "予約Goldを保存", exact: true })
    .click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.clock.runFor(1000);
  const raw = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("loop-breaker.current") ?? "null"),
  );
  // Save interval is five seconds; toggles are saved synchronously.
  expect(raw.automation.routeEnabled).toBe(true);
  expect(Number(raw.automation.reserveGold)).toBe(1000);
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expect(page.getByText("PRESTIGE READY", { exact: true })).toBeVisible();
  await expect(page.getByTestId("passive-abilities")).toContainText(
    "Critical Lv9",
  );
  await expect(page.getByTestId("next-passives")).toContainText(
    "Critical Lv9 → Lv10",
  );
  await expect(page.getByTestId("next-passives")).toContainText(
    "Overkill Lv8 → Lv10",
  );
  await page.getByRole("button", { name: "Prestigeする", exact: true }).click();
  await page
    .getByRole("button", { name: "ResetしてPrestigeを確定", exact: true })
    .click();
  await expect(page.getByTestId("passive-abilities")).toContainText(
    "Critical Lv10",
  );
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "UPGRADES ↗", exact: true }).click();
  await expect(toggle).toBeChecked();
  await page.screenshot({
    path: info.outputPath("passives-auto-route.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.getByRole("button", { name: "設定・Save" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SaveをExport", exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error("no Export");
  const text = readFileSync(path, "utf8"),
    saved = JSON.parse(text);
  expect(saved.balanceVersion).toBe("speed-7");
  expect(saved.automation.routeEnabled).toBe(true);
  expect(Object.keys(saved.run.upgrades)).toEqual(["atk", "delay"]);
  expect(saved.meta.deepMasteryLevel).toBe(2);
  await page.getByLabel("Save JSON", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Importを確認", exact: true }).click();
  await page
    .getByRole("button", { name: "このSaveをImport", exact: true })
    .click();
  await page.getByRole("button", { name: "UPGRADES ↗", exact: true }).click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "UPGRADES ↗", exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  const height = (await page.locator(".control-panel").boundingBox())?.height;
  expect(height).toBeLessThanOrEqual(200);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  console.log("Passive Quick Buy", info.project.name, height);
});
