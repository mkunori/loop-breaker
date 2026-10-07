import { describe, expect, it } from "vitest";
import { BALANCE, validateBalance } from "../src/config/balance";
import { advance } from "../src/game/advance";
import {
  boundary,
  clearTime,
  hp,
  rangeTotals,
  stageAt,
} from "../src/game/math";
import { D } from "../src/game/number";
import { decode, encode } from "../src/game/save";
import { initialState } from "../src/game/state";
import { prestige17State } from "./fixtures";

const legacyHp = (stage: number) =>
  D(240)
    .mul(D(1.002).pow(stage - 1))
    .mul(D(1.02).pow(Math.max(0, stage - 100)));

function fixtureReach() {
  let s = prestige17State();
  let seconds = 0;
  while (s.run.highestClearedStage < 850 && seconds < 600) {
    s = advance(s, 1).state;
    seconds++;
  }
  return { seconds, state: s };
}

describe("piecewise deep HP", () => {
  it.each([1, 100, 250, 500, 700])(
    "exactly preserves legacy HP at Stage%s",
    (stage) => {
      expect(hp(stage).eq(legacyHp(stage))).toBe(true);
    },
  );
  it.each([
    [700, 1.002 * 1.005],
    [1000, 1.002 * 1.001],
  ])("changes only the next-stage growth at %s", (stage, growth) => {
    expect(
      hp(stage + 1)
        .div(hp(stage))
        .toNumber(),
    ).toBeCloseTo(growth, 12);
    const expected = D(240)
      .mul(D(1.002).pow(stage - 1))
      .mul(D(1.02).pow(Math.min(Math.max(stage - 100, 0), 600)))
      .mul(D(1.005).pow(Math.min(Math.max(stage - 700, 0), 300)))
      .mul(D(1.001).pow(Math.max(stage - 1000, 0)));
    expect(hp(stage).eq(expected)).toBe(true);
  });
  it("is strictly increasing through every boundary and the protection limit", () => {
    for (const stage of [
      1,
      99,
      100,
      699,
      700,
      701,
      999,
      1000,
      1001,
      1499,
      1e9 - 1,
    ])
      expect(hp(stage + 1).gt(hp(stage))).toBe(true);
  });
  it("rejects discontinuous or invalid segment configuration", () => {
    for (const patch of [
      { end: 699 },
      { growth: 1 },
      { start: 700 },
      { end: null },
    ]) {
      const config = structuredClone(BALANCE);
      Object.assign(config.hp.deepSegments[0], patch);
      expect(() => validateBalance(config)).toThrow();
    }
  });
  it("matches small CLEAR reference sums crossing all new HP boundaries", () => {
    const s = initialState();
    s.run.targetStage = 1500;
    s.run.upgrades.atk = 50;
    for (const [lo, hi] of [
      [690, 710],
      [990, 1010],
      [99, 1002],
    ]) {
      const from = boundary(lo) + 2,
        to = boundary(hi) + 3;
      let time = D(0),
        gold = D(0);
      for (let n = from; n < to; n++) {
        const stage = 1 + Math.floor(n / 5);
        time = time.add(clearTime(s, stage));
        gold = gold.add(10 * (1 + 0.0005 * Math.min(stage - 1, 100)));
      }
      const diag = { segments: 0, stageComparisons: 0, formulaGroups: 0 };
      const totals = rangeTotals(s, from, to, diag);
      expect(totals.time.div(time).toNumber()).toBeCloseTo(1, 10);
      expect(totals.gold.div(gold).toNumber()).toBeCloseTo(1, 10);
      expect(diag.formulaGroups).toBeLessThanOrEqual(4);
    }
  });
  it("sums a billion Stages with at most four formula blocks", () => {
    const s = initialState();
    s.run.targetStage = BALANCE.limits.stage;
    const diag = { segments: 0, stageComparisons: 0, formulaGroups: 0 };
    const totals = rangeTotals(s, 0, boundary(BALANCE.limits.stage) + 1, diag);
    expect(totals.time.gt(0)).toBe(true);
    expect(Number.isFinite(totals.time.log10())).toBe(true);
    expect(diag.formulaGroups).toBe(4);
  });
  it("reaches Stage850 from the real P17 state within 120s with AUTO unchanged", () => {
    const fixture = prestige17State();
    expect(stageAt(fixture)).toBe(807);
    expect(decode(encode(fixture)).run.upgrades).toEqual(fixture.run.upgrades);
    const result = fixtureReach();
    expect(result.seconds).toBe(77);
    expect(result.seconds).toBeLessThanOrEqual(120);
    expect(result.state.meta.prestigeCount).toBe(17);
    expect(result.state.automation.autoAdvanceEnabled).toBe(true);
    expect(result.state.run.upgrades.atk).toBe(56);
    expect(result.state.run.upgrades.delay).toBe(6);
    const segments = BALANCE.hp.deepSegments;
    let legacy = result;
    try {
      Object.assign(BALANCE.hp, {
        deepSegments: [{ start: 100, end: null, growth: 1.02 }],
      });
      legacy = fixtureReach();
    } finally {
      Object.assign(BALANCE.hp, { deepSegments: segments });
    }
    expect(legacy.seconds).toBe(521);
    expect(result.seconds / legacy.seconds).toBeLessThan(0.15);
    console.log("P17 production regression", {
      oldSeconds: legacy.seconds,
      newSeconds: result.seconds,
    });
  });
});
