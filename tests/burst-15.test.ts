import { describe, expect, it } from "vitest";
import { command } from "../src/game/commands";
import { clearTime, fixedDelay, mastery } from "../src/game/math";
import { D } from "../src/game/number";
import { initialState } from "../src/game/state";
import { playModel } from "./balance-model";
import reference from "./data/speed7-reference.json";

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

describe("Immediate Prestige", () => {
  it("reaches BURST with immediate resets without exponential late stagnation", () => {
    const result = playModel("immediate", 51);
    console.log("Immediate Prestige:", result);
    expect(result.burst).toBeGreaterThan(933);
    expect(result.burst).toBeGreaterThan(1000);
    expect(result.burst).toBeLessThan(1050);
    // Free Prestige passives shorten early resets; speed-6 remains in Python baseline.
    expect(result.times[11]).toBeGreaterThan(result.times[9]);
    expect(Math.max(...result.times.slice(20))).toBeLessThan(240);
    expect(Math.min(...result.times.slice(20))).toBeGreaterThan(60);
    expect(result.state.meta.deepMasteryLevel).toBe(0);
    expect(result.times[30] / result.times[20]).toBeLessThan(1.3);
    reference.immediate.forEach((t, i) => {
      expect(Math.abs(result.times[i] - t)).toBeLessThan(Math.max(4, t * 0.01));
    });
  });
  it("continues mastery after BREAK II without number underflow", () => {
    expect(mastery(0).eq(1)).toBe(true);
    expect(mastery(1).eq(0.55)).toBe(true);
    expect(mastery(2).eq(0.36)).toBe(true);
    expect(mastery(3).toNumber()).toBeCloseTo(0.36 * 0.88, 12);
    expect(mastery(10000).gt(0)).toBe(true);
  });
});
