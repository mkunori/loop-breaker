import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VISUAL, visualForStage } from "../src/config/visual";

describe("presentation asset configuration", () => {
  it.each([
    [1, "01"],
    [99, "01"],
    [100, "02"],
    [199, "02"],
    [200, "03"],
    [349, "03"],
    [350, "04"],
    [549, "04"],
    [550, "05"],
    [1e9, "05"],
  ])("selects Stage %s without changing game state", (stage, id) => {
    expect(visualForStage(Number(stage)).id).toBe(id);
  });
  it("ships all 17 real WebP assets within the budget, with alpha for cutouts", () => {
    const assets = [
      VISUAL.logo,
      VISUAL.hero,
      ...VISUAL.zones.flatMap((z) => [z.background, z.enemy, z.boss]),
    ];
    expect(new Set(assets).size).toBe(17);
    let total = 0;
    for (const url of assets) {
      const bytes = readFileSync(`public/${url.slice(url.indexOf("assets/"))}`);
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
      const cutout = !url.includes("backgrounds/");
      if (cutout) {
        expect(bytes.toString("ascii", 12, 16)).toBe("VP8X");
        expect(bytes[20] & 0x10).toBe(0x10);
        expect(bytes.readUIntLE(24, 3) + 1).toBe(
          url.includes("branding/") ? 720 : url.includes("bosses/") ? 320 : 256,
        );
      }
      expect(bytes.length).toBeLessThan(200_000);
      total += bytes.length;
    }
    expect(total).toBeLessThan(5 * 1024 * 1024);
  });
});
