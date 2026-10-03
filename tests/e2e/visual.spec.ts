import { expect, type Page, test } from "@playwright/test";
import { fixture } from "../fixtures";

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/assets/") && r.status() >= 400)
      messages.push(`${r.status()} ${r.url()}`);
  });
  await page.clock.install();
  await page.goto("./");
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
});
async function importSave(page: Page, text: string) {
  await page.getByRole("button", { name: "設定・Save" }).click();
  await page.getByLabel("Save JSON", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Importを確認", exact: true }).click();
  await page
    .getByRole("button", { name: "このSaveをImport", exact: true })
    .click();
}
async function decoded(page: Page, id: string) {
  await expect(page.getByTestId(id).locator("img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByTestId(id)
        .locator("img")
        .evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0),
    )
    .toBe(true);
}
function zoneSave(stage: number, boss = false) {
  const raw = JSON.parse(fixture("burst"));
  raw.run.targetStage = Math.max(150, stage);
  raw.run.routeClears = Math.ceil((12 * (stage - 1)) / 5);
  raw.run.clears = String(raw.run.routeClears);
  raw.run.highestClearedStage = stage === 1 ? 0 : stage - 1;
  raw.run.upgrades = { atk: 0, speed: 0, crit: 0, overkill: 0, delay: 0 };
  raw.run.phase = boss ? 0.75 : 0;
  raw.run.burst = { active: false, seconds: 0, clears: "0", gold: "0" };
  raw.stats.totalClears = raw.run.clears;
  raw.stats.highestStage = raw.run.highestClearedStage;
  raw.automation.atkEnabled = false;
  return JSON.stringify(raw);
}
test("all Zone art loads, RUN progress selects Boss, and HUD remains usable", async ({
  page,
}, info) => {
  await decoded(page, "logo-image");
  await decoded(page, "hero-image");
  await page.screenshot({
    path: info.outputPath("normal.png"),
    fullPage: true,
  });
  const arena = await page
    .getByRole("region", { name: "自動戦闘" })
    .boundingBox();
  for (const [stage, zone] of [
    [1, "01"],
    [100, "02"],
    [200, "03"],
    [350, "04"],
    [550, "05"],
  ] as const) {
    await importSave(page, zoneSave(stage));
    await expect(page.getByTestId("battle-scene")).toHaveAttribute(
      "data-zone",
      zone,
    );
    await expect(
      page.getByTestId("opponent-image").locator("img"),
    ).toHaveAttribute("src", new RegExp(`enemy-zone-${zone}\\.webp$`));
    for (const id of ["hero-image", "opponent-image", "background-image"])
      await decoded(page, id);
    await importSave(page, zoneSave(stage, true));
    await expect(page.getByText("BOSS", { exact: true })).toBeVisible();
    await expect(
      page.getByTestId("opponent-image").locator("img"),
    ).toHaveAttribute("src", new RegExp(`boss-zone-${zone}\\.webp$`));
    await decoded(page, "opponent-image");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const finalArena = await page
    .getByRole("region", { name: "自動戦闘" })
    .boundingBox();
  expect(finalArena?.height).toBe(arena?.height);
  const controls = await page.locator(".control-panel").boundingBox();
  for (const id of ["clear-time", "clears"]) {
    const bounds = await page.getByTestId(id).boundingBox();
    expect((bounds?.y ?? 0) + (bounds?.height ?? 0)).toBeLessThanOrEqual(
      controls?.y ?? 0,
    );
  }
  const buy = await page.getByTestId("buy-atk").boundingBox();
  expect(buy?.height).toBeGreaterThanOrEqual(48);
  expect(buy?.y).toBeGreaterThan(0);
  expect((buy?.y ?? 0) + (buy?.height ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.height ?? 0,
  );
  await expect(page.getByTestId("clear-time")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("boss-zone-05.png"),
    fullPage: true,
  });
});
test("BURST uses fixed decoration and both Reduced Motion controls stop animation", async ({
  page,
}, info) => {
  await importSave(page, fixture("burst"));
  await expect(page.getByTestId("burst-visual")).toBeVisible();
  const nodes = await page.getByTestId("burst-visual").locator("*").count();
  await expect
    .poll(() =>
      page
        .locator(".burst-ring")
        .evaluate((e) => getComputedStyle(e).animationName),
    )
    .toBe("loop-spin");
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const selector of [".burst-ring", ".compression-lines"])
    await expect
      .poll(() =>
        page
          .locator(selector)
          .evaluate((e) => getComputedStyle(e).animationName),
      )
      .toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "設定・Save" }).click();
  await page.getByLabel("アニメーションを減らす").check();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator(".burst-ring")
        .evaluate((e) => getComputedStyle(e).animationName),
    )
    .toBe("none");
  await page.clock.runFor(10000);
  expect(await page.getByTestId("burst-visual").locator("*").count()).toBe(
    nodes,
  );
  await page.screenshot({
    path: info.outputPath("burst-reduced-motion.png"),
    fullPage: true,
  });
  const inflated = JSON.parse(fixture("burst"));
  inflated.meta.prestigeCount = 59;
  inflated.meta.upgrades = { power: 150, wealth: 150, tempo: 120 };
  inflated.run.targetStage = 2950;
  inflated.run.routeClears = 7079;
  inflated.run.highestClearedStage = 2950;
  inflated.run.clears = "7079";
  inflated.stats.totalClears = "7079";
  inflated.stats.highestStage = 2950;
  inflated.run.upgrades = {
    atk: 1000,
    speed: 8,
    crit: 8,
    overkill: 8,
    delay: 30,
  };
  inflated.automation.atkEnabled = false;
  inflated.settings.reducedMotion = true;
  await importSave(page, JSON.stringify(inflated));
  await page.clock.runFor(7000);
  await expect(
    page.getByTestId("burst-visual").locator("strong"),
  ).toContainText(/e\+15/);
  expect(await page.getByTestId("burst-visual").locator("*").count()).toBe(
    nodes,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const raw = JSON.parse(zoneSave(1));
  raw.settings.reducedMotion = true;
  await importSave(page, JSON.stringify(raw));
  await expect
    .poll(() =>
      page
        .locator(".hero-art")
        .evaluate((e) => getComputedStyle(e).animationName),
    )
    .toBe("none");
  await expect
    .poll(() =>
      page
        .locator(".versus")
        .evaluate((e) => getComputedStyle(e, "::after").animationName),
    )
    .toBe("none");
});
test("MASTERY celebrates the command, expires, and does not replay on Import", async ({
  page,
}, info) => {
  await importSave(page, fixture("prestige"));
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await page.screenshot({
    path: info.outputPath("prestige.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Prestigeする", exact: true }).click();
  await page
    .getByRole("button", { name: "ResetしてPrestigeを確定", exact: true })
    .click();
  await expect(page.getByTestId("mastery-celebration")).toContainText(
    "BREAK I",
  );
  await expect(page.getByTestId("mastery-celebration")).toBeInViewport({
    ratio: 1,
  });
  await page.clock.runFor(500);
  await page.screenshot({
    path: info.outputPath("mastery-break-i.png"),
    animations: "disabled",
    fullPage: true,
  });
  // Other messages must not cancel the expiry timer and leave a permanent banner.
  await page.getByRole("button", { name: /POWER Lv0/ }).click();
  await page.clock.runFor(5100);
  await expect(page.getByTestId("mastery-celebration")).toHaveCount(0);
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  const raw = JSON.parse(fixture("prestige"));
  raw.meta.prestigeCount = 1;
  await importSave(page, JSON.stringify(raw));
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expect(page.getByTestId("mastery-celebration")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Prestigeする", exact: true }).click();
  await page
    .getByRole("button", { name: "ResetしてPrestigeを確定", exact: true })
    .click();
  await expect(page.getByTestId("mastery-celebration")).toContainText(
    "BREAK II",
  );
  await expect
    .poll(() =>
      page
        .getByTestId("mastery-celebration")
        .evaluate((e) => getComputedStyle(e).animationName),
    )
    .toBe("none");
});
test("opening a sheet resets its shared scroll position", async ({ page }) => {
  // Keep each project's width; a shorter viewport makes all source sheets scrollable.
  await page.setViewportSize({
    width: page.viewportSize()?.width ?? 320,
    height: 400,
  });
  await importSave(page, fixture("prestige"));
  const dialog = page.getByRole("dialog");
  const close = async () => {
    // Escape closes without a click that could itself scroll the sheet to its heading.
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  };
  const expectTop = async () => {
    await expect(dialog).toBeVisible();
    await expect
      .poll(() => dialog.evaluate((e) => e.scrollTop))
      .toBeLessThanOrEqual(1);
  };
  const scrollBottom = async () => {
    await expect(dialog).toBeVisible();
    await dialog.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await expect
      .poll(() => dialog.evaluate((e) => e.scrollTop))
      .toBeGreaterThan(0);
  };
  await page.getByRole("button", { name: "設定・Save" }).click();
  await scrollBottom();
  await close();
  await page.getByRole("button", { name: /Prestige ·/ }).click();
  await expectTop();
  await expect(dialog.locator(".soul-banner")).toBeInViewport({ ratio: 1 });
  await close();
  await page.getByRole("button", { name: "UPGRADES ↗" }).click();
  await scrollBottom();
  await close();
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expectTop();
  await scrollBottom();
  await close();
  await page.getByRole("button", { name: "設定・Save" }).click();
  await expectTop();
});

test("failed images preserve layout and accessible labels", async ({
  page,
}) => {
  await page.route("**/assets/characters/hero.webp", (route) => route.abort());
  await page.route("**/assets/branding/loop-breaker-logo.webp", (route) =>
    route.abort(),
  );
  await page.reload();
  await expect(
    page.getByTestId("hero-image").locator(".asset-fallback"),
  ).toBeVisible();
  await expect(page.getByTestId("logo-image")).toContainText("LOOP BREAKER");
  await expect(
    page.getByRole("heading", { name: "LOOPBREAKER" }),
  ).toBeVisible();
  await expect(page.getByText("HERO", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByTestId("buy-atk")).toBeVisible();
});
