import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

test("Quick Buy keeps two cards and numeric HUD visible with all details in the sheet", async ({
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
  const panel = page.locator(".control-panel");
  expect((await panel.boundingBox())?.height).toBeLessThanOrEqual(200);
  const raw = JSON.parse(fixture("prestige"));
  raw.meta.prestigeCount = 2;
  raw.run.upgrades = { atk: 50, speed: 2, crit: 2, overkill: 1, delay: 8 };
  raw.run.gold = "1e8";
  raw.automation.atkEnabled = false;
  await page.getByRole("button", { name: "設定・Save" }).click();
  await page.getByLabel("Save JSON", { exact: true }).fill(JSON.stringify(raw));
  await page.getByRole("button", { name: "Importを確認", exact: true }).click();
  await page
    .getByRole("button", { name: "このSaveをImport", exact: true })
    .click();
  const quick = page.locator(".quick-upgrades");
  await expect(quick.locator("button")).toHaveCount(2);
  await expect(quick.getByTestId("buy-atk")).toContainText("ATK");
  await expect(quick.getByTestId("buy-delay")).toContainText("Route");
  await expect(quick.getByTestId("buy-delay")).toContainText("→");
  await expect(quick.getByTestId("buy-delay")).not.toContainText("×0.6");
  await expect(panel).not.toContainText("予約");
  const bounds = await panel.boundingBox();
  console.log("Quick Buy panel", info.project.name, bounds?.height);
  expect(bounds?.height).toBeLessThanOrEqual(200);
  for (const id of ["stage", "gold", "clear-time", "clears"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(
      bounds?.y ?? 0,
    );
  }
  await page.screenshot({
    path: info.outputPath("quick-buy.png"),
    fullPage: true,
    animations: "disabled",
  });
  const projected = await quick
    .getByTestId("buy-delay")
    .locator(".upgrade-effect")
    .innerText();
  const next = projected.split("→")[1].trim();
  await quick.getByTestId("buy-delay").click();
  await expect(page.getByTestId("clear-time")).toContainText(next);
  await page.getByRole("button", { name: "UPGRADES" }).click();
  const detail = page.locator(".all-upgrades");
  await expect(detail.locator("button")).toHaveCount(5);
  await expect(detail.getByTestId("buy-delay")).toContainText("Cap 12");
  await expect(detail.getByTestId("buy-atk")).toContainText("Damage ×1.16");
  await expect(detail.getByTestId("buy-delay")).toContainText("Route待ち係数");
  await expect(page.getByLabel("予約Gold", { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("upgrade-sheet.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".hero-art")).toHaveCSS("animation-name", "none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("published Saves retain target CLEAR and resources on reload without a wipe", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const text = localStorage.getItem("test.legacy-next");
    if (text) {
      // Seed after the old document's pagehide Save, before the new app loads.
      localStorage.setItem("loop-breaker.current", text);
      localStorage.removeItem("test.legacy-next");
    }
  });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.goto("./");
  for (const version of ["prototype-2", "speed-3"]) {
    const raw = JSON.parse(fixture("prestige"));
    raw.balanceVersion = version;
    raw.run.routeClears = version === "prototype-2" ? 239 : 3961;
    raw.run.clears = "239";
    raw.stats.totalClears = "239";
    raw.automation.atkEnabled = false;
    await page.evaluate(
      (text) => localStorage.setItem("test.legacy-next", text),
      JSON.stringify(raw),
    );
    await page.reload();
    await expect(page.getByTestId("stage")).toHaveText("100");
    await expect(page.getByTestId("gold")).toHaveText("100");
    await page.getByRole("button", { name: "設定・Save" }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "SaveをExport", exact: true })
      .click();
    const path = await (await download).path();
    if (!path) throw new Error("Export missing");
    const save = JSON.parse(readFileSync(path, "utf8"));
    expect(save.balanceVersion).toBe("speed-4");
    expect(save.saveVersion).toBe(1);
    expect(save.run.routeClears).toBe(496);
    expect(Number(save.run.clears)).toBe(239);
    expect(save.run.upgrades).toEqual(raw.run.upgrades);
    expect(save.meta).toEqual(raw.meta);
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  }
});
