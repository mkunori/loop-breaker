import { expect, test } from "@playwright/test";

// Also runnable after merge against Pages in an isolated, temporary browser context.
test("Pages base path loads metadata, assets, battle and persistent Save", async ({
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
  const response = await page.goto("./");
  expect(response?.status()).toBe(200);
  const base = new URL(page.url());
  expect(base.pathname).toBe("/loop-breaker/");
  await expect(page).toHaveTitle("LOOP BREAKER");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /5秒のRUN/,
  );
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /width=device-width/,
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute(
    "content",
    "#0b1020",
  );
  for (const id of [
    "logo-image",
    "hero-image",
    "opponent-image",
    "background-image",
  ]) {
    const img = page.getByTestId(id).locator("img");
    await expect(img).toBeVisible();
    await expect
      .poll(() =>
        img.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0),
      )
      .toBe(true);
  }
  const resources = await page
    .locator('script[src], link[rel="stylesheet"], link[rel="icon"]')
    .evaluateAll((elements) =>
      elements.map(
        (e) => e.getAttribute("src") ?? e.getAttribute("href") ?? "",
      ),
    );
  const artwork = [
    "/loop-breaker/assets/characters/hero.webp",
    "/loop-breaker/assets/branding/loop-breaker-logo.webp",
    ...["01", "02", "03", "04", "05"].flatMap((zone) => [
      `/loop-breaker/assets/backgrounds/background-zone-${zone}.webp`,
      `/loop-breaker/assets/enemies/enemy-zone-${zone}.webp`,
      `/loop-breaker/assets/bosses/boss-zone-${zone}.webp`,
    ]),
  ];
  for (const path of [...resources, ...artwork]) {
    const url = new URL(path, base);
    expect(url.origin).toBe(base.origin);
    expect(url.pathname).toMatch(/^\/loop-breaker\/assets\//);
    const resource = await page.request.get(url.href);
    expect(resource.status(), url.href).toBe(200);
    expect(resource.headers()["content-type"]).not.toContain("text/html");
  }
  await page.clock.runFor(6000);
  await expect(page.getByTestId("clears")).toHaveText("1");
  await expect(page.getByTestId("gold")).toHaveText("10");
  // The existing first ATK costs 100 Gold; earn enough RUNs without changing balance.
  await page.clock.runFor(50000);
  const savedClears = await page.getByTestId("clears").innerText();
  await page.getByTestId("buy-atk").click();
  await expect(page.getByTestId("buy-atk")).toContainText("Lv 1");
  await page.getByRole("button", { name: "設定・Save" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "SaveをExport", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("loop-breaker-save.json");
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  await page.reload();
  await expect(page.getByTestId("buy-atk")).toContainText("Lv 1");
  await expect(page.getByTestId("clears")).toHaveText(savedClears);
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "閉じる", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
