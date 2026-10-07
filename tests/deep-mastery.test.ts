import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/config/balance";
import { advance } from "../src/game/advance";
import { command } from "../src/game/commands";
import {
  boundary,
  canPrestige,
  clearTime,
  deepMasteryEarned,
  mastery,
  nextDeepMasteryStage,
  prestigeDeepMastery,
  requiredStage,
  soulReward,
} from "../src/game/math";
import { D } from "../src/game/number";
import { decode, encode } from "../src/game/save";
import { initialState } from "../src/game/state";

function cleared(p: number, stage: number, deep = 0) {
  const s = initialState();
  s.meta.prestigeCount = p;
  s.meta.deepMasteryLevel = deep;
  s.run.targetStage = Math.max(requiredStage(p), stage);
  s.run.highestClearedStage = stage;
  s.run.routeClears = boundary(stage) + 1;
  s.run.clears = D(s.run.routeClears);
  s.stats.totalClears = s.run.clears;
  s.stats.highestStage = stage;
  return s;
}
const reset = (s: ReturnType<typeof cleared>) =>
  command(s, { type: "prestige", expectedCount: s.meta.prestigeCount }).state;

describe("Prestige cap and Deep MASTERY", () => {
  it("preserves required stages through P16 then caps at800", () => {
    for (let p = 0; p <= 16; p++)
      expect(requiredStage(p)).toBe(100 + 50 * Math.max(0, p - 2));
    for (const p of [17, 20, 30, 50, 10000]) expect(requiredStage(p)).toBe(800);
  });
  it("keeps exact legacy mastery before P16 and uses14 steps from P16", () => {
    for (let p = 0; p < 16; p++) {
      const expected = D([1, 0.55, 0.36][Math.min(2, p)]).mul(
        D(0.88).pow(Math.max(0, p - 2)),
      );
      expect(mastery(p, 50).eq(expected)).toBe(true);
    }
    expect(mastery(15).eq(D(0.36).mul(D(0.88).pow(13)))).toBe(true);
    expect(mastery(16).eq(D(0.36).mul(D(0.88).pow(14)))).toBe(true);
    expect(mastery(17).eq(mastery(16))).toBe(true);
    expect(mastery(50).eq(mastery(16))).toBe(true);
    expect(mastery(17, 3).eq(D(0.36).mul(D(0.88).pow(17)))).toBe(true);
    expect(mastery(50, 10000).gt(0)).toBe(true);
  });
  it.each([
    [799, false],
    [800, true],
    [801, true],
    [825, true],
    [850, true],
    [900, true],
  ])("Stage%s CLEAR readiness is %s even during deepening", (stage, ready) => {
    expect(canPrestige(cleared(17, stage))).toBe(ready);
  });
  it.each([
    [799, 0],
    [800, 0],
    [801, 0],
    [849, 0],
    [850, 1],
    [899, 1],
    [900, 2],
    [950, 3],
  ])(
    "Stage%s earns absolute level%s only when Prestige commits",
    (stage, earned) => {
      expect(deepMasteryEarned(stage)).toBe(earned);
      const s = cleared(16, stage);
      const factor = mastery(16, s.meta.deepMasteryLevel);
      expect(s.meta.deepMasteryLevel).toBe(0);
      const next = reset(s);
      expect(next.meta.deepMasteryLevel).toBe(earned);
      if (stage >= 800) {
        expect(next.meta.prestigeCount).toBe(17);
        expect(next.run.targetStage).toBe(800);
        expect(
          mastery(17, next.meta.deepMasteryLevel).div(factor).toNumber(),
        ).toBeCloseTo(0.88 ** earned, 12);
        expect(next.meta.soul.eq(soulReward(s))).toBe(true);
      }
    },
  );
  it.each([
    [0, 800, 850],
    [0, 849, 850],
    [0, 850, 900],
    [0, 899, 900],
    [0, 900, 950],
    [0, 950, 1000],
    [3, 950, 1000],
    [0, BALANCE.limits.stage, null],
  ])(
    "current Lv%s / highest%s previews next milestone%s",
    (level, highest, next) => {
      const state = cleared(16, highest, level);
      expect(nextDeepMasteryStage(prestigeDeepMastery(state))).toBe(next);
      expect(state.meta.deepMasteryLevel).toBe(level);
    },
  );
  it("P15->16 shortens once; P16->17 at800 adds no mastery", () => {
    const p16 = reset(cleared(15, 750));
    expect(p16.meta.prestigeCount).toBe(16);
    expect(p16.run.targetStage).toBe(800);
    const p17 = reset(cleared(16, 800));
    expect(p17.meta.prestigeCount).toBe(17);
    expect(p17.meta.deepMasteryLevel).toBe(0);
    expect(mastery(16).eq(mastery(17))).toBe(true);
  });
  it("does not apply a milestone on CLEAR, only at the next confirmed Prestige", () => {
    const s = cleared(16, 849);
    s.run.targetStage = 850;
    s.run.routeClears = boundary(850);
    s.run.clears = D(s.run.routeClears);
    s.run.upgrades = { atk: 55, speed: 8, crit: 8, overkill: 8, delay: 6 };
    s.meta.upgrades = { power: 10, wealth: 9, tempo: 9 };
    const crossed = advance(s, clearTime(s, 850).toNumber()).state;
    expect(crossed.run.highestClearedStage).toBe(850);
    expect(crossed.meta.deepMasteryLevel).toBe(0);
    const next = reset(crossed);
    expect(next.meta.deepMasteryLevel).toBe(1);
    expect(
      mastery(next.meta.prestigeCount, 1).div(mastery(16)).toNumber(),
    ).toBeCloseTo(0.88, 12);
  });
  it("does not reacquire milestones or gain on repeated/stale Prestige commands", () => {
    for (const stage of [800, 850, 899, 900, 950]) {
      const s = cleared(25, stage, 3);
      const next = reset(s);
      expect(next.meta.deepMasteryLevel).toBe(3);
      expect(reset(next).meta.prestigeCount).toBe(26);
      expect(
        command(next, { type: "prestige", expectedCount: 25 }).state,
      ).toEqual(next);
    }
  });
  it("batch awards millions of levels in O(1) and handles the protection frontier", () => {
    const s = cleared(50, BALANCE.limits.stage);
    const next = reset(s);
    expect(next.meta.deepMasteryLevel).toBe(
      deepMasteryEarned(BALANCE.limits.stage),
    );
    expect(nextDeepMasteryStage(next.meta.deepMasteryLevel)).toBeNull();
    expect(nextDeepMasteryStage(0)).toBe(850);
    expect(nextDeepMasteryStage(3)).toBe(1000);
    expect(decode(encode(next)).meta.deepMasteryLevel).toBe(
      next.meta.deepMasteryLevel,
    );
  });
  it("retains AUTO setting and all levels on Save reload, not normal upgrades", () => {
    const s = cleared(16, 950);
    s.automation.autoAdvanceEnabled = true;
    const next = decode(encode(reset(s)));
    expect(next.meta.deepMasteryLevel).toBe(3);
    expect(next.automation.autoAdvanceEnabled).toBe(true);
    expect(next.run.targetStage).toBe(800);
    expect(next.run.upgrades.atk).toBe(0);
    expect(advance(next, 5).state.meta.prestigeCount).toBe(17);
  });
  it.each([-1, 0.5, null, "3", Infinity, 20000000])(
    "rejects invalid Deep save level %s",
    (level) => {
      const raw = JSON.parse(encode(initialState()));
      raw.meta.deepMasteryLevel = level;
      expect(() => decode(JSON.stringify(raw))).toThrow();
    },
  );
  it("stores early-earned milestones without changing pre-cap mastery", () => {
    const s = reset(cleared(3, 950));
    expect(s.meta.deepMasteryLevel).toBe(3);
    expect(mastery(4, 3).eq(mastery(4))).toBe(true);
  });
});
