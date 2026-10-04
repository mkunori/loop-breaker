import { afterEach, describe, expect, it, vi } from "vitest";
import { BALANCE } from "../src/config/balance";
import { advance } from "../src/game/advance";
import { command } from "../src/game/commands";
import * as math from "../src/game/math";
import { D } from "../src/game/number";
import { decode, encode } from "../src/game/save";
import { initialState } from "../src/game/state";
import { GameRuntime } from "../src/platform/runtime";
import { SAVE_KEYS, type StoragePort } from "../src/platform/storage";

function ready(cleared = true) {
  const s = initialState();
  s.meta.prestigeCount = 3;
  s.run.targetStage = 150;
  s.run.routeClears = math.boundary(150) + Number(cleared);
  s.run.highestClearedStage = cleared ? 150 : 149;
  s.run.clears = D(s.run.routeClears);
  s.stats.totalClears = D(s.run.routeClears);
  s.stats.highestStage = s.run.highestClearedStage;
  return s;
}
function enable(s = ready()) {
  return command(s, { type: "autoAdvance", enabled: true }).state;
}
afterEach(() => vi.restoreAllMocks());
describe("AUTO ADVANCE target rules", () => {
  it("OFF farms and manual +25 remains available without reusing farm CLEAR", () => {
    const s = ready();
    s.run.clears = D(1e12);
    const farm = advance(s, 5).state;
    expect(farm.run.targetStage).toBe(150);
    expect(farm.run.routeClears).toBe(746);
    const next = command(farm, { type: "deepen" }).state;
    expect(next.run.targetStage).toBe(175);
    expect(next.run.routeClears).toBe(746);
    expect(command(next, { type: "deepen" }).state.run.targetStage).toBe(175);
  });
  it("does nothing on an uncleared target and advances only after its actual CLEAR", () => {
    const s = enable(ready(false));
    const t = math.clearTime(s).toNumber();
    expect(s.run.targetStage).toBe(150);
    expect(advance(s, t / 2).state.run.targetStage).toBe(150);
    const next = advance(s, t).state;
    expect(next.run.targetStage).toBe(175);
    expect(next.run.highestClearedStage).toBe(150);
    expect(next.run.routeClears).toBe(746);
    expect(next.meta.prestigeCount).toBe(3);
  });
  it("enabling on a farm advances once, repeated ON and manual commands cannot double deepen", () => {
    const s = ready();
    s.run.clears = D(1e12);
    s.run.phase = 0.4;
    const next = enable(s);
    expect(next.run.targetStage).toBe(175);
    expect(next.run.routeClears).toBe(746);
    expect(next.run.phase).toBe(0.4);
    expect(enable(next).run.targetStage).toBe(175);
    expect(command(next, { type: "deepen" }).state.run.targetStage).toBe(175);
    expect(s.automation.autoAdvanceEnabled).toBe(false);
  });
  it.each([0, 1, 2])("does not deepen before Prestige3 (%s)", (p) => {
    const s = ready();
    s.meta.prestigeCount = p;
    expect(advance(enable(s), 5).state.run.targetStage).toBe(150);
  });
  it("OFF restores farming, and Prestige preserves ON without automating Prestige or purchases", () => {
    const s = enable();
    const reset = command(s, { type: "prestige", expectedCount: 3 }).state;
    expect(reset.automation.autoAdvanceEnabled).toBe(true);
    expect(reset.run.targetStage).toBe(200);
    expect(reset.run.routeClears).toBe(0);
    expect(advance(reset, 5).state.run.targetStage).toBe(200);
    expect(advance(reset, 5).state.meta.prestigeCount).toBe(4);
    expect(advance(reset, 5).state.run.upgrades.atk).toBe(0);
    const off = command(s, { type: "autoAdvance", enabled: false }).state;
    expect(advance(off, 5).state.run.targetStage).toBe(175);
  });
  it("clamps at the last reachable +25 target even when the Stage limit is not aligned", () => {
    const s = ready();
    s.run.targetStage = BALANCE.limits.stage - 10;
    s.run.highestClearedStage = s.run.targetStage;
    expect(enable(s).run.targetStage).toBe(s.run.targetStage);
    expect(advance(enable(s), 0).state.run.targetStage).toBe(s.run.targetStage);
    s.run.targetStage = BALANCE.limits.stage - 25;
    s.run.highestClearedStage = s.run.targetStage;
    const capped = enable(s);
    expect(capped.run.targetStage).toBe(BALANCE.limits.stage);
    capped.run.highestClearedStage = BALANCE.limits.stage;
    expect(enable(capped).run.targetStage).toBe(BALANCE.limits.stage);
  });
});

describe("aggregate auto targets", () => {
  it("shares AUTO ATK clock boundaries without introducing new purchase opportunities", () => {
    const s = enable(ready(false));
    s.run.gold = D(1e12);
    s.run.upgrades = { atk: 70, speed: 3, crit: 2, overkill: 2, delay: 12 };
    s.meta.unlocks.autoAtk = true;
    s.automation.atkEnabled = true;
    const whole = advance(s, 5).state;
    let divided = s;
    for (let i = 0; i < 50; i++) divided = advance(divided, 0.1).state;
    expect(whole.run.upgrades).toEqual(divided.run.upgrades);
    expect(whole.run.targetStage).toBe(divided.run.targetStage);
    expect(whole.run.routeClears).toBe(divided.run.routeClears);
    expect(whole.run.gold.div(divided.run.gold).toNumber()).toBeCloseTo(1, 8);
  });
  it("matches a one-CLEAR manual reference across several targets with phase and Stage Gold", () => {
    let reference = ready(false);
    reference.run.targetStage = 200;
    reference.run.routeClears = math.boundary(190);
    reference.run.highestClearedStage = 189;
    reference.stats.highestStage = 189;
    reference.run.clears = D(reference.run.routeClears);
    reference.stats.totalClears = D(reference.run.routeClears);
    reference.run.upgrades = {
      atk: 70,
      speed: 3,
      crit: 2,
      overkill: 2,
      delay: 12,
    };
    reference.run.phase = 0.35;
    const automatic = enable(reference);
    let elapsed = 0;
    // Test-only reference loop; production never loops over CLEAR or target.
    for (let i = 0; i < 350; i++) {
      const dt = math
        .clearTime(reference)
        .mul(1 - reference.run.phase)
        .toNumber();
      elapsed += dt;
      reference = advance(reference, dt).state;
      if (math.canDeepen(reference))
        reference = command(reference, { type: "deepen" }).state;
    }
    expect(elapsed).toBeLessThan(5);
    const result = advance(automatic, elapsed).state;
    expect(result.run.targetStage).toBe(reference.run.targetStage);
    expect(result.run.targetStage).toBeGreaterThan(250);
    expect(result.run.routeClears).toBe(reference.run.routeClears);
    expect(result.run.highestClearedStage).toBe(
      reference.run.highestClearedStage,
    );
    expect(result.run.gold.div(reference.run.gold).toNumber()).toBeCloseTo(
      1,
      10,
    );
    expect(result.run.phase).toBeCloseTo(reference.run.phase, 7);
  });
  it("BURST crosses thousands of targets with bounded diagnostics and correct exit / partial window", () => {
    const s = ready(false);
    s.meta.prestigeCount = 59;
    s.meta.upgrades = { power: 150, wealth: 150, tempo: 120 };
    s.run.upgrades = { atk: 10000, speed: 8, crit: 8, overkill: 8, delay: 30 };
    const result = advance(enable(s), 5);
    expect(result.state.run.targetStage).toBeGreaterThan(50000);
    expect(result.state.run.targetStage % 25).toBe(0);
    expect(result.state.run.highestClearedStage).toBeLessThan(
      result.state.run.targetStage,
    );
    expect(
      result.state.run.targetStage - result.state.run.highestClearedStage,
    ).toBeLessThanOrEqual(25);
    expect(result.diagnostics.segments).toBeLessThanOrEqual(8);
    expect(result.diagnostics.stageComparisons).toBeLessThan(500);
    expect(result.events.length).toBeLessThan(10);
    expect(
      result.events.some(
        (event) => event.kind === "burst" && event.result.partial,
      ),
    ).toBe(true);
    expect(result.state.meta.prestigeCount).toBe(59);
    expect(result.state.run.upgrades.atk).toBe(10000);
    expect(decode(encode(result.state)).run.targetStage).toBe(
      result.state.run.targetStage,
    );
    let divided = enable(s);
    for (let i = 0; i < 50; i++) divided = advance(divided, 0.1).state;
    expect(result.state.run.routeClears).toBe(divided.run.routeClears);
    expect(result.state.run.targetStage).toBe(divided.run.targetStage);
    expect(result.state.run.gold.div(divided.run.gold).toNumber()).toBeCloseTo(
      1,
      9,
    );
    expect(result.state.run.burst.active).toBe(divided.run.burst.active);
    console.log("AUTO ADVANCE diagnostics", result.diagnostics);
  });
  it.each([1e6, 1e12])(
    "%s CLEAR at the protection frontier takes a fixed number of operations",
    (count) => {
      vi.spyOn(math, "clearTime").mockReturnValue(D(5).div(count));
      vi.spyOn(math, "rangeTotals").mockImplementation((s, from, to) => ({
        time: D(5)
          .div(count)
          .mul(to - from),
        gold: math.goldPerClear(s, BALANCE.limits.stage).mul(to - from),
      }));
      const s = ready();
      s.run.targetStage = BALANCE.limits.stage - 25;
      s.run.routeClears = math.boundary(s.run.targetStage) + 1;
      s.run.highestClearedStage = s.run.targetStage;
      s.run.clears = D(s.run.routeClears);
      s.stats.totalClears = D(s.run.routeClears);
      s.stats.highestStage = s.run.highestClearedStage;
      const result = advance(enable(s), 5);
      expect(result.state.run.targetStage).toBe(BALANCE.limits.stage);
      expect(result.state.run.routeClears).toBe(
        math.boundary(BALANCE.limits.stage) + 1,
      );
      expect(result.state.run.clears.sub(s.run.clears).toNumber()).toBeCloseTo(
        count,
        -1,
      );
      expect(result.diagnostics.segments).toBeLessThanOrEqual(6);
      expect(result.diagnostics.stageComparisons).toBeLessThan(50);
      expect(
        result.events.some(
          (event) =>
            event.kind === "burst" &&
            !event.result.partial &&
            event.result.seconds === 5,
        ),
      ).toBe(true);
    },
  );
});
describe("same-balance Save and hidden runtime", () => {
  it("defaults missing v1 field to OFF, preserves ON roundtrip and rejects invalid flag / old balance", () => {
    const raw = JSON.parse(encode(ready()));
    delete raw.automation.autoAdvanceEnabled;
    expect(decode(JSON.stringify(raw)).automation.autoAdvanceEnabled).toBe(
      false,
    );
    expect(decode(encode(enable())).automation.autoAdvanceEnabled).toBe(true);
    raw.automation.autoAdvanceEnabled = 1;
    expect(() => decode(JSON.stringify(raw))).toThrow();
    raw.automation.autoAdvanceEnabled = true;
    raw.balanceVersion = "speed-3";
    expect(() => decode(JSON.stringify(raw))).toThrow("旧Saveは利用できません");
  });
  it("runtime reload / Export / Import retain ON and hidden time cannot advance targets", () => {
    const values = new Map<string, string>();
    const storage: StoragePort = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
    };
    values.set(SAVE_KEYS.current, encode(enable()));
    let now = 0;
    const runtime = new GameRuntime(storage, () => now);
    runtime.visibility(true);
    now = 100000;
    runtime.tick();
    expect(runtime.getSnapshot().state.run.targetStage).toBe(175);
    const exported = runtime.exportSave();
    runtime.importSave(exported);
    expect(runtime.getSnapshot().paused).toBe(true);
    expect(runtime.getSnapshot().state.automation.autoAdvanceEnabled).toBe(
      true,
    );
    expect(
      new GameRuntime(storage).getSnapshot().state.automation
        .autoAdvanceEnabled,
    ).toBe(true);
  });
});
