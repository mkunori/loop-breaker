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
test.beforeEach(async ({ page }) => {
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
  await page.goto("./");
});
test("visual LOD and Reduced Motion follow time units without attack events", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const scene = page.getByTestId("battle-scene");
  await expect(scene).toHaveAttribute("data-lod", "normal");
  await expect(page.getByTestId("clear-time")).toContainText("5.00 s");
  await page.screenshot({
    path: info.outputPath("normal-5s.png"),
    fullPage: true,
    animations: "allow",
    style:
      ".slash-effect,.hero-art,.enemy-art{animation-delay:-0.45s!important;animation-play-state:paused!important;}",
  });
  const normalNodes = await scene.locator("*").count();
  for (const [atk, delay, lod, unit] of [
    [20, 1, "fast", "ms"],
    [50, 6, "ultra", "ms"],
    [80, 14, "burst", "μs"],
  ] as const) {
    const raw = JSON.parse(fixture("prestige"));
    raw.meta.prestigeCount = 4;
    raw.run.targetStage = 200;
    raw.run.upgrades = { atk, speed: 3, crit: 3, overkill: 2, delay };
    raw.automation.atkEnabled = false;
    await importSave(page, JSON.stringify(raw));
    await expect(scene).toHaveAttribute("data-lod", lod);
    await expect(page.getByTestId("clear-time")).toContainText(unit);
    if (lod !== "burst")
      expect(await scene.locator("*").count()).toBe(normalNodes);
    await page.screenshot({
      path: info.outputPath(`${lod}.png`),
      fullPage: true,
      animations: "disabled",
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const selector of lod === "burst"
      ? [".burst-ring"]
      : [".slash-effect", ".hero-art", ".enemy-art", ".speed-trails"])
      await expect
        .poll(() =>
          page
            .locator(selector)
            .evaluate((e) => getComputedStyle(e).animationName),
        )
        .toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("million and trillion CLEAR scales keep DOM, React commits and network bounded", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let requests = 0;
  page.on("request", () => requests++);
  const observations: number[] = [];
  for (const [atk, delay, tempo, minimum] of [
    [480, 22, 0, 1e6],
    [1000, 30, 120, 1e12],
  ] as const) {
    const raw = JSON.parse(fixture("burst"));
    raw.meta.prestigeCount = 59;
    raw.meta.upgrades = { power: 150, wealth: 150, tempo };
    raw.run.targetStage = 2950;
    raw.run.routeClears = 14746;
    raw.run.highestClearedStage = 2950;
    raw.run.clears = "14746";
    raw.stats.totalClears = "14746";
    raw.stats.highestStage = 2950;
    raw.run.upgrades = { atk, speed: 8, crit: 8, overkill: 8, delay };
    raw.automation.atkEnabled = false;
    raw.run.burst = { active: false, seconds: 0, clears: "0", gold: "0" };
    await importSave(page, JSON.stringify(raw));
    await expect(page.getByTestId("burst-visual")).toBeVisible();
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
      Number(
        (window as unknown as Record<string, unknown>).presentationCommits,
      ),
    );
    expect(commits).toBeGreaterThan(0);
    const network = requests;
    await page.clock.runFor(5000);
    expect(await page.getByTestId("battle-scene").locator("*").count()).toBe(
      nodes,
    );
    expect(requests - network).toBe(0);
    const delta =
      (await page.evaluate(() =>
        Number(
          (window as unknown as Record<string, unknown>).presentationCommits,
        ),
      )) - commits;
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(55);
    console.log("Presentation budget", {
      minimum,
      nodes,
      commits: delta,
      requests: requests - network,
    });
    observations.push(delta);
    await page.getByRole("button", { name: "設定・Save" }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "SaveをExport", exact: true })
      .click();
    const path = await (await download).path();
    if (!path) throw new Error("Save export path missing");
    const { readFileSync } = await import("node:fs");
    expect(
      Number(JSON.parse(readFileSync(path, "utf8")).run.clears) - 14746,
    ).toBeGreaterThanOrEqual(minimum);
    await page.getByRole("button", { name: "閉じる", exact: true }).click();
  }
  expect(Math.abs(observations[0] - observations[1])).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
