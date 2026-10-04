import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { fixture } from "../fixtures";

async function importSave(page: Page, text: string) {
  await page.getByRole("button", { name: "設定・Save" }).click();
  await page.getByLabel("Save JSON", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Importを確認", exact: true }).click();
  await page
    .getByRole("button", { name: "このSaveをImport", exact: true })
    .click();
}
function state(cleared = true) {
  const raw = JSON.parse(fixture("prestige"));
  raw.meta.prestigeCount = 3;
  raw.run.targetStage = 150;
  raw.run.routeClears = 745 + Number(cleared);
  raw.run.highestClearedStage = cleared ? 150 : 149;
  raw.run.clears = `${raw.run.routeClears}`;
  raw.stats.totalClears = `${raw.run.routeClears}`;
  raw.stats.highestStage = raw.run.highestClearedStage;
  raw.automation.atkEnabled = false;
  return raw;
}
test("AUTO ADVANCE is outside Quick Buy, defaults OFF, roundtrips ON and survives Prestige", async ({
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
  await expect(page.getByLabel("AUTO ADVANCE", { exact: true })).toHaveCount(0);
  const raw = state();
  delete raw.automation.autoAdvanceEnabled; // Existing same-balance speed-4 v1.
  await importSave(page, JSON.stringify(raw));
  const toggle = page.getByLabel("AUTO ADVANCE", { exact: true });
  await expect(toggle).not.toBeChecked();
  const manual = page.getByRole("button", {
    name: "さらに進む +25",
    exact: true,
  });
  await expect(manual).toBeEnabled();
  await expect(
    page.locator(".control-panel").getByLabel("AUTO ADVANCE", { exact: true }),
  ).toHaveCount(0);
  expect(
    (await page.locator(".control-panel").boundingBox())?.height,
  ).toBeLessThanOrEqual(200);
  await page.screenshot({
    path: info.outputPath("auto-advance-off.png"),
    fullPage: true,
    animations: "disabled",
  });
  await toggle.check();
  await expect(page.locator(".auto-advance")).toContainText("AUTO ADVANCE ON");
  await expect(page.getByTestId("stage")).toHaveText("150");
  await expect(manual).toBeDisabled();
  await expect(
    page.getByText("STAGE / TARGET 175", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("auto-advance-on.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: "設定・Save" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SaveをExport", exact: true }).click();
  const path = await (await download).path();
  if (!path) throw new Error("Export missing");
  const text = readFileSync(path, "utf8");
  expect(JSON.parse(text).automation.autoAdvanceEnabled).toBe(true);
  expect(JSON.parse(text).run.targetStage).toBe(175);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await importSave(page, text);
  await expect(toggle).toBeChecked();
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await page.getByRole("button", { name: "Prestigeする", exact: true }).click();
  await page
    .getByRole("button", { name: "ResetしてPrestigeを確定", exact: true })
    .click();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect(toggle).toBeChecked();
  await expect(page.getByTestId("stage")).toHaveText("1");
  await toggle.uncheck();
  await expect(toggle).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("uncleared target is not skipped, while huge route traversal keeps DOM / commits / requests fixed", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requests = 0;
  const requestUrls: string[] = [];
  page.on("request", (r) => {
    requests++;
    requestUrls.push(r.url());
  });
  await page.addInitScript(() => {
    const host = window as unknown as Record<string, unknown>;
    host.presentationCommits = 0;
    host.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberRoot: () => {
        host.presentationCommits = Number(host.presentationCommits) + 1;
      },
      onCommitFiberUnmount: () => {},
    };
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto("./");
  const pending = state(false);
  await importSave(page, JSON.stringify(pending));
  await page.getByLabel("AUTO ADVANCE", { exact: true }).check();
  await expect(
    page.getByText("STAGE / TARGET 150", { exact: true }),
  ).toBeVisible();
  const raw = state(false);
  raw.meta.prestigeCount = 59;
  raw.meta.upgrades = { power: 150, wealth: 150, tempo: 120 };
  raw.run.targetStage = 2950;
  raw.run.routeClears = 14745;
  raw.run.highestClearedStage = 2949;
  raw.run.clears = "14745";
  raw.stats.totalClears = "14745";
  raw.stats.highestStage = 2949;
  raw.run.upgrades = { atk: 10000, speed: 8, crit: 8, overkill: 8, delay: 30 };
  raw.automation.autoAdvanceEnabled = true;
  raw.run.burst.active = true;
  await importSave(page, JSON.stringify(raw));
  await expect(page.getByTestId("burst-visual")).toBeVisible();
  // Depth HP can exit BURST in this unlimited route. Warm up the legitimate
  // mode transition before measuring DOM stability caused by target changes.
  await page.clock.runFor(1000);
  await expect
    .poll(() =>
      page
        .getByTestId("background-image")
        .locator("img")
        .evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
    )
    .toBe(true);
  const nodes = await page.getByTestId("battle-scene").locator("*").count();
  const commits = await page.evaluate(() =>
    Number((window as unknown as Record<string, unknown>).presentationCommits),
  );
  const network = requests;
  await page.clock.runFor(5000);
  expect(await page.getByTestId("battle-scene").locator("*").count()).toBe(
    nodes,
  );
  const delta =
    (await page.evaluate(() =>
      Number(
        (window as unknown as Record<string, unknown>).presentationCommits,
      ),
    )) - commits;
  expect(delta).toBeGreaterThan(0);
  expect(delta).toBeLessThanOrEqual(55);
  // Advancing route phase changes Enemy/Boss art at the existing UI cadence.
  // At most two existing sources, bounded by render cadence, never by CLEAR.
  const during = requestUrls.slice(network);
  expect(during.length).toBeLessThanOrEqual(55);
  expect(new Set(during).size).toBeLessThanOrEqual(2);
  for (const url of during)
    expect(url).toMatch(/\/(enemies\/enemy|bosses\/boss)-zone-05\.webp$/);
  const saved = JSON.parse(
    (await page.evaluate(() => localStorage.getItem("loop-breaker.current"))) ??
      "{}",
  );
  expect(saved.run.targetStage).toBeGreaterThan(50000);
  expect(saved.run.highestClearedStage).toBeLessThan(saved.run.targetStage);
  expect(
    saved.run.targetStage - saved.run.highestClearedStage,
  ).toBeLessThanOrEqual(25);
  expect(saved.meta.prestigeCount).toBe(59);
  console.log("AUTO ADVANCE presentation", {
    nodes,
    commits: delta,
    requests: requests - network,
    target: saved.run.targetStage,
  });
  await page.screenshot({
    path: info.outputPath("auto-advance-targets.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
