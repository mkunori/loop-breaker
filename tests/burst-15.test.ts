import { describe, expect, it } from "vitest";
import { command } from "../src/game/commands";
import { boundary, clearTime, fixedDelay, stageAt } from "../src/game/math";
import { D } from "../src/game/number";
import { decode, encode } from "../src/game/save";
import { initialState } from "../src/game/state";
import { playModel } from "./balance-model";

describe("15-minute BURST", () => {
  it("distinguishes active, casual and true AUTO ATK play", () => {
    const active = playModel("active", 3);
    const casual = playModel("casual", 3);
    const auto = playModel("auto", 3);
    console.log("Model milestones:", { active, casual, auto });
    expect(active.burst).toBeGreaterThan(780);
    expect(active.burst).toBeLessThan(1020);
    expect(casual.burst).toBeGreaterThan(active.burst ?? 0);
    expect(auto.burst).toBeGreaterThan(casual.burst ?? 0);
    expect(auto.burst).toBeGreaterThan(1200);
    expect(auto.burst).toBeLessThan(1500);
    expect(active.times[0]).toBeGreaterThan(300);
    expect(active.times[0]).toBeLessThan(360);
    expect(active.autoAt).toBeGreaterThan(180);
    expect(active.autoAt).toBeLessThan(300);
    expect(active.checkpoints[60]).toBeGreaterThan(2);
    expect(active.checkpoints[60]).toBeLessThan(3);
    for (const threshold of [1, 0.1, 0.01, 0.001])
      expect(active.milestones[threshold]).toBeGreaterThan(0);
  });
  it("ATK removes the floor while Route keeps a large marginal benefit", () => {
    const s = initialState();
    expect(clearTime(s).toNumber()).toBe(5);
    s.run.upgrades.atk = 150;
    expect(clearTime(s).lt(0.001)).toBe(true);
    s.meta.prestigeCount = 2;
    s.meta.unlocks.delay = true;
    s.run.gold = D(1e8);
    s.run.upgrades.atk = 50;
    s.run.upgrades.delay = 8;
    const before = clearTime(s);
    const after = clearTime(command(s, { type: "buy", id: "delay" }).state);
    expect(after.div(before).toNumber()).toBeLessThan(0.75);
    expect(after.gt(0)).toBe(true);
    console.log("Route purchase seconds:", before.toNumber(), after.toNumber());
    s.run.upgrades.atk = 0;
    s.run.upgrades.delay = 0;
    expect(fixedDelay(s).toNumber()).toBe(1);
  });
});

describe("published speed-3 compatibility", () => {
  it.each([0, 1, 39, 40, 41, 3959, 3960, 3961])(
    "preserves route %s Stage, resources and one-time conversion",
    (route) => {
      const raw = JSON.parse(encode(initialState()));
      raw.balanceVersion = "speed-3";
      raw.run.routeClears = route;
      raw.run.highestClearedStage = route
        ? Math.min(100, 1 + Math.floor((route - 1) / 40))
        : 0;
      raw.run.gold = "1234";
      raw.run.clears = "239"; // previously migrated saves may have virtual route > CLEAR.
      raw.stats.totalClears = "239";
      raw.stats.highestStage = raw.run.highestClearedStage;
      raw.run.phase = 0.75;
      raw.meta.soul = "17";
      raw.automation.reserveGold = "42";
      const s = decode(JSON.stringify(raw));
      expect(stageAt(s)).toBe(Math.min(100, 1 + Math.floor(route / 40)));
      expect(s.run.highestClearedStage).toBe(raw.run.highestClearedStage);
      expect(s.run.gold.eq(1234)).toBe(true);
      expect(s.run.clears.eq(239)).toBe(true);
      expect(s.meta.soul.eq(17)).toBe(true);
      expect(s.run.phase).toBe(0.75);
      expect(s.automation.reserveGold.eq(42)).toBe(true);
      expect(decode(encode(s)).run.routeClears).toBe(s.run.routeClears);
      if (route === 3961) expect(s.run.routeClears).toBe(boundary(100) + 1);
    },
  );
});
