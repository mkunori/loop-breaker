import { describe, expect, it } from "vitest";
import { combatLod } from "../src/config/combatVisual";
import { advance } from "../src/game/advance";
import { boundary, clearTime, stageAt } from "../src/game/math";
import { D } from "../src/game/number";
import { decode, encode, SAVE_VERSION } from "../src/game/save";
import { initialState } from "../src/game/state";
import { formatTime } from "../src/ui/formatTime";

describe("speed presentation", () => {
  it.each([
    [5, "5.00 s"],
    [1.24, "1.24 s"],
    [0.842, "842 ms"],
    [0.0917, "91.7 ms"],
    [0.00842, "8.42 ms"],
    [0.000713, "713 μs"],
    [1e-6, "1.00 μs"],
    [1e-9, "1.00 ns"],
    [1e-12, "1.00 ps"],
  ])("formats %s without changing internal precision", (value, expected) => {
    const time = D(value);
    const before = time.toString();
    expect(formatTime(time)).toBe(expected);
    expect(time.toString()).toBe(before);
  });
  it("keeps extreme values and near-boundary values readable", () => {
    expect(formatTime(D("1e-100"))).toContain("e-100 s");
    expect(formatTime(D(0.999999))).toBe("1000 ms");
  });
  it("selects independent, bounded visual LOD", () => {
    expect(combatLod(D(5), false)).toBe("normal");
    expect(combatLod(D(1), false)).toBe("normal");
    expect(combatLod(D(0.999), false)).toBe("fast");
    expect(combatLod(D(0.1), false)).toBe("fast");
    expect(combatLod(D(0.099), false)).toBe("ultra");
    expect(combatLod(D("1e-20"), true)).toBe("burst");
  });
});
describe("published prototype-2 Save compatibility", () => {
  it.each([0, 1, 3, 50, 238, 239])(
    "maps old route %s once without wiping or granting rewards",
    (route) => {
      const raw = JSON.parse(encode(initialState()));
      raw.balanceVersion = "prototype-2";
      raw.run.routeClears = route;
      raw.run.clears = "2000";
      raw.run.gold = "1234";
      raw.run.phase = 0.25;
      raw.run.highestClearedStage =
        route === 0 ? 0 : Math.min(100, 1 + Math.floor(((route - 1) * 5) / 12));
      raw.stats.totalClears = "2000";
      raw.stats.highestStage = raw.run.highestClearedStage;
      raw.meta.soul = "17";
      raw.meta.unlocks.speed = true;
      const s = decode(JSON.stringify(raw));
      expect(stageAt(s)).toBe(Math.min(100, 1 + Math.floor((route * 5) / 12)));
      expect(s.run.highestClearedStage).toBe(raw.run.highestClearedStage);
      expect(s.run.clears.toString()).toBe("2000");
      expect(s.run.gold.toString()).toBe("1234");
      expect(s.meta.soul.toString()).toBe("17");
      expect(s.run.phase).toBe(0.25);
      expect(s.meta.unlocks.speed).toBe(true);
      const reloaded = decode(encode(s));
      expect(reloaded.run.routeClears).toBe(s.run.routeClears);
      expect(SAVE_VERSION).toBe(1);
      if (route === 239) expect(s.run.routeClears).toBe(boundary(100) + 1);
      expect(() => advance(s, 1)).not.toThrow();
    },
  );
  it("rejects corrupt legacy progress instead of silently repairing it", () => {
    const raw = JSON.parse(encode(initialState()));
    raw.balanceVersion = "prototype-2";
    raw.run.routeClears = 239;
    raw.run.highestClearedStage = 100;
    expect(() => decode(JSON.stringify(raw))).toThrow();
  });
  it("starts at exactly 5 seconds and enters BURST below 1ms", () => {
    expect(clearTime(initialState()).toNumber()).toBe(5);
    const s = initialState();
    s.meta.prestigeCount = 20;
    s.meta.upgrades.tempo = 30;
    s.run.upgrades.delay = 30;
    s.run.upgrades.atk = 200;
    expect(advance(s, 5).state.run.burst.active).toBe(true);
  });
});
