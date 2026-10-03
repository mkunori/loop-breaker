import { afterEach, describe, expect, it, vi } from "vitest";
import { BALANCE, UPGRADE_IDS, validateBalance } from "../src/config/balance";
import { advance } from "../src/game/advance";
import { command } from "../src/game/commands";
import * as math from "../src/game/math";
import { D, format, splitWork } from "../src/game/number";
import { decode, encode } from "../src/game/save";
import { type GameState, initialState } from "../src/game/state";

const almost = (a: { toNumber(): number }, b: number) =>
  expect(a.toNumber()).toBeCloseTo(b, 8);
function farmState(): GameState {
  const s = initialState();
  s.run.routeClears = 239;
  s.run.clears = D(239);
  s.stats.totalClears = D(239);
  s.run.highestClearedStage = 100;
  s.stats.highestStage = 100;
  return s;
}
afterEach(() => vi.restoreAllMocks());
describe("balance math", () => {
  it("rejects invalid config before gameplay", () => {
    expect(() => validateBalance()).not.toThrow();
    for (const patch of [{ growth: 1 }, { growth: Infinity }, { normal: -1 }]) {
      const config = structuredClone(BALANCE);
      Object.assign(config.hp, patch);
      expect(() => validateBalance(config)).toThrow();
    }
    const config = structuredClone(BALANCE);
    Object.assign(config, { critChance: 0.2 });
    expect(() => validateBalance(config)).toThrow();
  });
  it("calculates damage, Crit expectation, Overkill, TEMPO and mastery", () => {
    const s = initialState();
    almost(math.damage(s), 10);
    almost(math.dps(s), 10);
    almost(math.clearTime(s), 30);
    s.run.upgrades.atk = 1;
    almost(math.damage(s), 11.6);
    s.meta.upgrades.power = 1;
    almost(math.damage(s), 19.72);
    s.run.upgrades.speed = 1;
    s.run.upgrades.crit = 1;
    almost(math.dps(s), 19.72 * 1.25 * 1.2);
    s.run.upgrades.overkill = 1;
    expect(math.overkill(s)).toBe(1.15);
    const before = math.clearTime(s);
    s.meta.upgrades.tempo = 1;
    almost(before.sub(math.clearTime(s)), 0.9);
    s.meta.prestigeCount = 2;
    almost(math.clearTime(s), before.sub(0.9).mul(0.36).toNumber());
    expect(math.mastery(20)).toBe(0.36);
  });
  it("defines caps and stage boundaries precisely", () => {
    expect(
      [0, 1, 2, 3, 9].map((p) => UPGRADE_IDS.map((id) => math.cap(id, p))),
    ).toEqual([
      [1e6, 1, 1, 1, 1],
      [1e6, 2, 1, 1, 1],
      [1e6, 2, 2, 1, 1],
      [1e6, 3, 2, 2, 2],
      [1e6, 6, 5, 5, 5],
    ]);
    const s = initialState();
    for (const [n, expected] of [
      [0, 1],
      [3, 2],
      [12, 6],
      [238, 100],
      [239, 100],
    ]) {
      s.run.routeClears = n;
      expect(math.stageAt(s)).toBe(expected);
    }
    expect(math.requiredStage(3)).toBe(150);
    expect(math.requiredStage(30)).toBe(1500);
    expect(math.stageGold(1)).toBe(1);
    expect(math.stageGold(100)).toBe(1.0495);
    expect(math.stageGold(100000)).toBe(1.05);
    almost(math.hp(101).div(math.hp(100)), 1.02204);
  });
  it("quotes MAX by a closed series, with exact budget and cap", () => {
    almost(math.price("atk", 0), 25);
    almost(math.price("atk", 1), 28.75);
    for (const id of UPGRADE_IDS) {
      const total = math.bulkPrice(id, 2, 10);
      let reference = D(0);
      for (let i = 0; i < 10; i++)
        reference = reference.add(math.price(id, 2 + i));
      almost(total.div(reference), 1);
      expect(math.maxBuy(id, 2, total, 100)).toBe(10);
      expect(math.maxBuy(id, 2, total.mul(0.999), 100)).toBe(9);
      expect(math.maxBuy(id, 2, total, 4)).toBe(2);
    }
    expect(math.maxBuy("atk", 0, D(24), 1e6)).toBe(0);
    expect(math.maxBuy("atk", 0, D("1e10000"), 1e6)).toBeGreaterThan(100000);
  });
  it("matches periodic HP/Gold sums against small reference loops", () => {
    const s = initialState();
    s.run.targetStage = 450;
    for (const [from, to] of [
      [0, 12],
      [214, 267],
      [0, 1079],
      [238, 350],
    ]) {
      let time = D(0),
        gold = D(0);
      for (let n = from; n < to; n++) {
        const stage = Math.min(450, 1 + Math.floor((5 * n) / 12));
        time = time.add(math.clearTime(s, stage));
        gold = gold.add(math.goldPerClear(s, stage));
      }
      const summed = math.rangeTotals(s, from, to);
      almost(summed.time.div(time), 1);
      almost(summed.gold.div(gold), 1);
    }
  });
  it("keeps HP and Gold cutoff settings independent", () => {
    const original = BALANCE.gold.stageCap;
    try {
      for (const cutoff of [80, 120]) {
        Object.assign(BALANCE.gold, { stageCap: cutoff });
        const s = initialState();
        s.run.targetStage = 200;
        let time = D(0),
          gold = D(0);
        for (let n = 0; n < 470; n++) {
          const stage = 1 + Math.floor((5 * n) / 12);
          time = time.add(math.clearTime(s, stage));
          gold = gold.add(math.goldPerClear(s, stage));
        }
        const summed = math.rangeTotals(s, 0, 470);
        almost(summed.time.div(time), 1);
        almost(summed.gold.div(gold), 1);
      }
    } finally {
      Object.assign(BALANCE.gold, { stageCap: original });
    }
  });
});
describe("advance and commands", () => {
  it("awards actual clears, preserves phase, unlocks and input immutability", () => {
    let s = initialState();
    const first = advance(s, 5).state;
    expect(s.run.phase).toBe(0);
    almost(D(first.run.phase), 1 / 6);
    for (let i = 0; i < 37; i++) s = advance(s, 5).state;
    expect(s.run.clears.toNumber()).toBeGreaterThanOrEqual(6);
    expect(s.meta.unlocks.speed).toBe(true);
    expect(s.run.gold.gt(60)).toBe(true);
    expect(s.run.routeClears).toBe(s.run.clears.toNumber());
  });
  it("preserves progress through purchases and refuses locked/unaffordable/capped upgrades", () => {
    const s = initialState();
    s.run.gold = D(100);
    s.run.phase = 0.7;
    expect(
      command(s, { type: "buy", id: "crit" }).state.run.upgrades.crit,
    ).toBe(0);
    const bought = command(s, { type: "buy", id: "atk", max: true }).state;
    expect(bought.run.upgrades.atk).toBe(3);
    expect(bought.run.phase).toBe(0.7);
    expect(bought.run.gold.gte(0)).toBe(true);
    s.meta.unlocks.speed = true;
    const capped = command(command(s, { type: "buy", id: "speed" }).state, {
      type: "buy",
      id: "speed",
    }).state;
    expect(capped.run.upgrades.speed).toBe(1);
  });
  it.each([0, 1, 2])("refuses deepen before three Prestiges (p=%s)", (p) => {
    const s = farmState();
    s.meta.prestigeCount = p;
    expect(math.canDeepen(s)).toBe(false);
    expect(command(s, { type: "deepen" }).state).toEqual(s);
  });
  it("refuses deepen until the current target is actually CLEARed", () => {
    const s = initialState();
    s.meta.prestigeCount = 3;
    s.run.targetStage = math.requiredStage(3);
    for (const stage of [1, s.run.targetStage]) {
      s.run.routeClears = math.boundary(stage);
      s.run.highestClearedStage = stage === 1 ? 0 : stage - 1;
      expect(math.canDeepen(s)).toBe(false);
      expect(command(s, { type: "deepen" }).state).toEqual(s);
    }
  });
  it("deepens one step after each target CLEAR and refuses repeated commands", () => {
    const s = farmState();
    s.meta.prestigeCount = 3;
    s.run.targetStage = math.requiredStage(3);
    s.run.routeClears = math.boundary(s.run.targetStage) + 1;
    s.run.highestClearedStage = s.run.targetStage;
    expect(math.canDeepen(s)).toBe(true);
    const next = command(s, { type: "deepen" }).state;
    expect(next.run.targetStage).toBe(175);
    expect(next.run.routeClears).toBe(s.run.routeClears);
    expect(math.canDeepen(next)).toBe(false);
    expect(command(next, { type: "deepen" }).state).toEqual(next);
    next.run.routeClears = math.boundary(175) + 1;
    next.run.highestClearedStage = 175;
    expect(command(next, { type: "deepen" }).state.run.targetStage).toBe(200);
  });
  it("does not bank farm clears for deeper routes", () => {
    const s = farmState();
    s.meta.prestigeCount = 3;
    const mock = vi.spyOn(math, "clearTime").mockReturnValue(D(0.001));
    const farmed = advance(s, 5).state;
    expect(farmed.run.clears.gt(5000)).toBe(true);
    expect(farmed.run.routeClears).toBe(239);
    const deep = command(farmed, { type: "deepen" }).state;
    expect(math.stageAt(deep)).toBe(100);
    expect(deep.run.routeClears).toBe(239);
    expect(deep.run.targetStage).toBe(125);
    expect(command(deep, { type: "deepen" }).state.run.targetStage).toBe(125);
    const resumed = advance(deep, 0.001).state;
    expect(resumed.run.routeClears).toBe(240);
    expect(resumed.run.highestClearedStage).toBe(100);
    expect(math.stageAt(resumed)).toBe(101);
    mock.mockRestore();
  });
  it("Prestige rewards once, without waiting, and keeps permanent settings/statistics", () => {
    const s = farmState();
    s.run.activeSeconds = 1;
    s.meta.unlocks.speed = true;
    s.meta.unlocks.autoAtk = true;
    s.automation.atkEnabled = true;
    s.automation.reserveGold = D(50);
    s.settings.reducedMotion = true;
    const next = command(s, { type: "prestige", expectedCount: 0 }).state;
    expect(next.meta.soul.toNumber()).toBe(4);
    expect(next.meta.prestigeCount).toBe(1);
    expect(math.mastery(next.meta.prestigeCount)).toBe(0.55);
    expect(next.run.routeClears).toBe(0);
    expect(next.run.gold.eq(0)).toBe(true);
    expect(next.run.phase).toBe(0);
    expect(next.stats.totalClears.eq(239)).toBe(true);
    expect(next.automation.atkEnabled).toBe(true);
    expect(next.settings.reducedMotion).toBe(true);
    expect(
      command(next, { type: "prestige", expectedCount: 0 }).state.meta.soul.eq(
        4,
      ),
    ).toBe(true);
    const repeat = farmState();
    repeat.meta.prestigeCount = 1;
    expect(math.soulReward(repeat).toNumber()).toBe(8);
    repeat.meta.prestigeCount = 3;
    repeat.run.highestClearedStage = 150;
    expect(math.soulReward(repeat).toNumber()).toBe(7);
  });
  it("AUTO respects the second boundary, reserve and ON/OFF", () => {
    const s = initialState();
    s.meta.unlocks.autoAtk = true;
    s.run.gold = D(100);
    s.automation.atkEnabled = true;
    s.automation.reserveGold = D(70);
    let next = advance(s, 0.5).state;
    expect(next.run.upgrades.atk).toBe(0);
    next = advance(next, 0.5).state;
    expect(next.run.upgrades.atk).toBe(1);
    expect(next.run.gold.toNumber()).toBe(75);
    next.automation.atkEnabled = false;
    expect(advance(next, 1).state.run.upgrades.atk).toBe(1);
  });
  it.each([128, 1e6, 1e12])(
    "aggregates %s CLEARs with constant segments",
    (count) => {
      vi.spyOn(math, "clearTime").mockReturnValue(D(5).div(count));
      const result = advance(farmState(), 5);
      expect(result.state.run.clears.sub(239).toNumber()).toBe(count);
      expect(result.state.stats.bestBurstClears.toNumber()).toBe(count);
      expect(result.state.run.phase).toBeCloseTo(0, 8);
      expect(result.diagnostics.segments).toBe(5);
      expect(result.diagnostics.stageComparisons).toBe(0);
      expect(result.events.filter((e) => e.kind === "burst")).toHaveLength(1);
    },
  );
  it("preserves sub-run fractions, hysteresis and partial-window statistics", () => {
    const mock = vi.spyOn(math, "clearTime").mockReturnValue(D(0.8));
    let s = advance(farmState(), 5).state;
    expect(s.run.phase).toBeCloseTo(0.25, 8);
    expect(s.stats.bestBurstClears.toNumber()).toBe(6);
    mock.mockReturnValue(D(1.05));
    s = advance(s, 0.5).state;
    expect(s.run.burst.active).toBe(true);
    mock.mockReturnValue(D(1.1));
    const exit = advance(s, 0.5);
    expect(exit.state.run.burst.active).toBe(false);
    expect(
      exit.events.some((e) => e.kind === "burst" && e.result.partial),
    ).toBe(true);
    expect(exit.state.stats.bestBurstClears.toNumber()).toBe(6);
  });
  it("equals divided time integration across Stage boundaries", () => {
    const s = initialState();
    s.run.upgrades.atk = 10;
    s.run.phase = 0.3;
    const whole = advance(s, 5).state;
    let divided = s;
    for (let i = 0; i < 50; i++) divided = advance(divided, 0.1).state;
    expect(whole.run.clears.eq(divided.run.clears)).toBe(true);
    almost(whole.run.gold, divided.run.gold.toNumber());
    expect(whole.run.phase).toBeCloseTo(divided.run.phase, 8);
  });
  it("rejects invalid time and marks beyond-safe integers as approximate", () => {
    expect(() => advance(initialState(), Infinity)).toThrow();
    expect(() => advance(initialState(), -1)).toThrow();
    expect(splitWork(D("1e20")).approximate).toBe(true);
    expect(format(D("1e42"))).toContain("e+42");
    expect(format(D("1e-100"))).toContain("e-100");
  });
  it("handles a tiny clock remainder at 1e12 CLEAR without discarding elapsed time", () => {
    vi.spyOn(math, "clearTime").mockReturnValue(D(5).div(1e12));
    const s = farmState();
    s.run.autoClock = 1 - 1e-11;
    const result = advance(s, 5);
    expect(
      Math.abs(result.state.run.clears.sub(239).toNumber() - 1e12),
    ).toBeLessThanOrEqual(1);
    expect(result.diagnostics.segments).toBeLessThanOrEqual(6);
    expect(result.state.run.activeSeconds).toBeCloseTo(5, 12);
  });
  it("aggregates an actual inflated route across thousands of Stages and saves its counters", () => {
    const s = initialState();
    s.meta.prestigeCount = 59;
    s.meta.upgrades = { power: 150, wealth: 150, tempo: 120 };
    s.run.targetStage = math.requiredStage(59);
    s.run.upgrades = { atk: 1000, speed: 8, crit: 8, overkill: 8, delay: 30 };
    for (const id of Object.keys(
      s.meta.unlocks,
    ) as (keyof typeof s.meta.unlocks)[])
      s.meta.unlocks[id] = true;
    const result = advance(s, 5);
    expect(result.state.run.clears.gt(1e12)).toBe(true);
    expect(result.state.run.routeClears).toBe(
      math.boundary(s.run.targetStage) + 1,
    );
    expect(result.state.run.highestClearedStage).toBe(s.run.targetStage);
    expect(
      decode(encode(result.state)).run.clears.eq(result.state.run.clears),
    ).toBe(true);
    s.run.upgrades.atk = 2000;
    s.meta.upgrades.tempo = 200;
    const approximate = advance(s, 5).state;
    expect(approximate.stats.approximateClears).toBe(true);
    expect(decode(encode(approximate)).stats.approximateClears).toBe(true);
    expect(result.diagnostics.stageComparisons).toBeLessThan(60);
    console.log(
      "Inflated route diagnostics:",
      result.diagnostics,
      "clears:",
      result.state.run.clears.toString(),
    );
  });
});
describe("reference player through twelve cycles", () => {
  it("reproduces pacing, soul ledger and the first BURST with the real aggregate engine", () => {
    let s = initialState();
    const times: number[] = [];
    let firstBurst: number | null = null,
      at25 = 0;
    for (let cycle = 0; cycle < 12; cycle++) {
      let seconds = 0;
      while (!math.canPrestige(s) && seconds < 7200) {
        s = advance(s, 1).state;
        seconds++;
        for (const id of ["speed", "crit", "overkill", "delay", "atk"] as const)
          s = command(s, { type: "buy", id, max: true }).state;
        if (cycle === 0 && seconds === 1500)
          at25 = math.clearTime(s).toNumber();
        if (s.meta.unlocks.burst && firstBurst === null) firstBurst = cycle + 1;
      }
      expect(math.canPrestige(s)).toBe(true);
      times.push(seconds);
      const beforeSoul = s.meta.soul,
        reward = math.soulReward(s);
      s = command(s, { type: "prestige", expectedCount: cycle }).state;
      expect(s.meta.soul.eq(beforeSoul.add(reward))).toBe(true);
      for (let purchases = 0; purchases < 100; purchases++) {
        const id = (["power", "wealth", "tempo"] as const).reduce((a, b) =>
          s.meta.upgrades[b] < s.meta.upgrades[a] ? b : a,
        );
        if (s.meta.soul.lt(math.soulPrice(id, s.meta.upgrades[id]))) break;
        s = command(s, { type: "permanent", id }).state;
      }
    }
    expect(times[0]).toBeGreaterThan(26 * 60);
    expect(times[0]).toBeLessThan(35 * 60);
    expect(times[1]).toBeGreaterThan(8 * 60);
    expect(times[1]).toBeLessThan(12 * 60);
    expect(times[2]).toBeGreaterThan(4 * 60);
    expect(times[2]).toBeLessThan(6 * 60);
    expect(at25).toBeGreaterThan(4);
    expect(at25).toBeLessThan(6);
    expect(firstBurst).toBe(3);
    const reference = [
      1823.23, 555.77, 276.27, 244.62, 310.72, 207.21, 223.53, 176.11, 201.81,
      204.41, 321.02, 465.84,
    ];
    times.forEach((t, i) => {
      expect(Math.abs(t - reference[i])).toBeLessThan(3);
    });
    console.log("Balance cycle seconds:", times, "25-minute time:", at25);
  }, 30000);
});
