import { describe, expect, it } from "vitest";
import { BALANCE, UPGRADE_IDS } from "../src/config/balance";
import { advance } from "../src/game/advance";
import { autoPurchase, autoPurchaseOrder } from "../src/game/automation";
import { type Command, command } from "../src/game/commands";
import {
  autoRouteUnlocked,
  boundary,
  clearTime,
  passiveLevels,
  prestigePassives,
  price,
} from "../src/game/math";
import { D } from "../src/game/number";
import { decode, encode } from "../src/game/save";
import { initialState } from "../src/game/state";
import vectors from "./data/auto-route-reference.json";

function ready(highest = 900, p = 16) {
  const s = initialState();
  s.meta.prestigeCount = p;
  s.run.targetStage = Math.max(800, highest);
  s.run.routeClears = boundary(highest) + 1;
  s.run.highestClearedStage = highest;
  s.run.clears = D(s.run.routeClears);
  s.stats.totalClears = s.run.clears;
  s.stats.highestStage = highest;
  s.meta.unlocks.delay = true;
  s.meta.unlocks.autoAtk = true;
  return s;
}
function automationState() {
  const s = initialState();
  s.meta.prestigeCount = 17;
  s.stats.highestStage = 900;
  s.meta.unlocks.autoAtk = true;
  s.meta.unlocks.delay = true;
  s.automation.atkEnabled = true;
  s.automation.routeEnabled = true;
  return s;
}
describe("free Prestige passives", () => {
  it.each([
    [1, 0, 2, 1, 1],
    [2, 0, 2, 2, 1],
    [3, 0, 3, 2, 2],
    [15, 4, 8, 8, 8],
    [16, 0, 8, 9, 8],
    [17, 0, 8, 9, 9],
    [17, 1, 8, 9, 9],
    [17, 2, 8, 10, 10],
    [17, 3, 8, 11, 11],
    [17, 4, 8, 12, 12],
    [20, 0, 8, 10, 10],
    [30, 0, 8, 10, 10],
    [50, 0, 8, 10, 10],
  ])("P%s Deep%s -> %s/%s/%s", (p, d, speed, crit, overkill) => {
    expect(prestigePassives(p, d)).toEqual({ speed, crit, overkill });
  });
  it.each([
    [6, "speed"],
    [20, "crit"],
    [40, "overkill"],
  ] as const)("P0 %s CLEAR freely unlocks %s exactly", (n, id) => {
    const s = initialState();
    s.run.clears = D(n - 1);
    s.run.routeClears = n - 1;
    s.run.highestClearedStage = 1 + Math.floor((n - 2) / 5);
    s.run.phase = 0.5;
    s.stats.highestStage = s.run.highestClearedStage;
    s.stats.totalClears = s.run.clears;
    s.run.gold = D(100);
    expect(passiveLevels(s)[id]).toBe(0);
    const next = advance(s, clearTime(s).toNumber() / 2).state;
    expect(next.run.clears.toNumber()).toBe(n);
    expect(passiveLevels(next)[id]).toBe(1);
    expect(next.run.gold.gt(100)).toBe(true);
    expect(next.run.upgrades).toEqual({ atk: 0, delay: 0 });
    expect(next.meta.unlocks[id]).toBe(true);
  });
  it("splits a batch only at the three initial passive boundaries", () => {
    const s = initialState();
    s.run.upgrades.atk = 10000;
    const result = advance(s, 5);
    expect(result.state.run.clears.gte(1e12)).toBe(true);
    expect(passiveLevels(result.state)).toEqual({
      speed: 1,
      crit: 1,
      overkill: 1,
    });
    expect(result.diagnostics.segments).toBeLessThan(12);
    expect(result.diagnostics.stageComparisons).toBeLessThan(250);
  });
  it("has only ATK/Route commands and rejects old passive purchases without spending", () => {
    expect(UPGRADE_IDS).toEqual(["atk", "delay"]);
    const s = ready();
    s.run.gold = D(1e9);
    for (const id of ["speed", "crit", "overkill"]) {
      const next = command(s, { type: "buy", id, max: true } as Command).state;
      expect(next).toEqual(s);
    }
  });
  it.each([
    [849, 0],
    [850, 1],
    [899, 1],
    [900, 2],
    [950, 3],
    [1000, 4],
  ])("Stage%s grants Deep%s/passives only after Prestige", (highest, d) => {
    const s = ready(highest);
    const before = passiveLevels(s);
    expect(before).toEqual({ speed: 8, crit: 9, overkill: 8 });
    expect(s.meta.deepMasteryLevel).toBe(0);
    const next = command(s, { type: "prestige", expectedCount: 16 }).state;
    expect(next.meta.deepMasteryLevel).toBe(d);
    expect(passiveLevels(next)).toEqual(prestigePassives(17, d));
    expect(next.run.targetStage).toBe(800);
    expect(decode(encode(next)).meta.deepMasteryLevel).toBe(d);
    expect(passiveLevels(decode(encode(next)))).toEqual(passiveLevels(next));
  });
});
describe("AUTO ROUTE", () => {
  it.each(vectors)(
    "matches Python policy / bulk spend: ATK$atk Route$route Stage$stage Gold$gold",
    (v) => {
      const s = automationState();
      s.meta.deepMasteryLevel = 3;
      s.run.targetStage = Math.max(800, v.stage);
      s.run.routeClears = boundary(v.stage);
      s.run.upgrades = { atk: v.atk, delay: v.route };
      s.run.gold = D(v.gold);
      s.automation.reserveGold = D(v.reserve);
      s.automation.atkEnabled = v.atk_on;
      s.automation.routeEnabled = v.route_on;
      expect(autoPurchaseOrder(s)).toEqual(v.order);
      autoPurchase(s);
      expect(s.run.upgrades).toEqual({
        atk: v.expected_atk,
        delay: v.expected_route,
      });
      expect(Math.abs(s.run.gold.toNumber() - v.expected_gold)).toBeLessThan(
        Math.max(1e-5, v.gold * 1e-12),
      );
    },
  );

  it("is locked at899, unlocks on900 CLEAR, starts OFF and announces once", () => {
    let s = ready(899);
    s.run.targetStage = 900;
    s.run.routeClears = boundary(900);
    s.run.clears = D(s.run.routeClears);
    s.stats.totalClears = s.run.clears;
    s.run.upgrades.atk = 80;
    expect(autoRouteUnlocked(s)).toBe(false);
    expect(
      command(s, { type: "autoRoute", enabled: true }).state.automation
        .routeEnabled,
    ).toBe(false);
    const result = advance(s, clearTime(s, 900).toNumber());
    s = result.state;
    expect(s.stats.highestStage).toBe(900);
    expect(autoRouteUnlocked(s)).toBe(true);
    expect(s.automation.routeEnabled).toBe(false);
    expect(
      result.events.filter(
        (e) => e.kind === "unlock" && e.label.startsWith("AUTO ROUTE"),
      ),
    ).toHaveLength(1);
    expect(
      advance(s, 1).events.filter(
        (e) => e.kind === "unlock" && e.label.startsWith("AUTO ROUTE"),
      ),
    ).toHaveLength(0);
  });
  it.each([false, true])(
    "retains %s through Prestige / Save / Import",
    (enabled) => {
      const s = command(ready(), { type: "autoRoute", enabled }).state;
      const next = command(s, { type: "prestige", expectedCount: 16 }).state;
      const restored = decode(encode(next));
      expect(restored.automation.routeEnabled).toBe(enabled);
      expect(autoRouteUnlocked(restored)).toBe(true);
      expect(advance(restored, 5).state.meta.prestigeCount).toBe(17);
    },
  );
  it("shares reserveGold and protects an unaffordable efficient Route from ATK", () => {
    const s = automationState();
    s.run.upgrades = { atk: 41, delay: 3 };
    s.automation.reserveGold = D(1000);
    s.run.gold = price("delay", 3).add(999);
    expect(s.run.gold.sub(1000).gt(price("atk", 41))).toBe(true);
    expect(autoPurchaseOrder(s)).toEqual([]);
    const gold = s.run.gold;
    autoPurchase(s);
    expect(s.run.gold.eq(gold)).toBe(true);
    s.run.gold = s.run.gold.add(1);
    autoPurchase(s);
    expect(s.run.upgrades).toEqual({ atk: 41, delay: 4 });
    expect(s.run.gold.eq(1000)).toBe(true);
  });
  it("buys only at the shared second boundary and handles both toggles independently", () => {
    const s = automationState();
    s.run.gold = D(1e7);
    s.automation.reserveGold = D(1000);
    const before = advance(s, 0.5).state;
    expect(before.run.upgrades).toEqual({ atk: 0, delay: 0 });
    const after = advance(before, 0.5).state;
    expect(after.run.upgrades.atk + after.run.upgrades.delay).toBeGreaterThan(
      0,
    );
    expect(after.run.gold.gte(1000)).toBe(true);
    for (const id of ["atk", "delay"] as const) {
      const one = automationState();
      one.run.gold = D(1e7);
      one.automation.atkEnabled = id === "atk";
      one.automation.routeEnabled = id === "delay";
      autoPurchase(one);
      expect(one.run.upgrades[id]).toBeGreaterThan(0);
      expect(one.run.upgrades[id === "atk" ? "delay" : "atk"]).toBe(0);
    }
  });
  it("uses bounded bulk purchases at huge Gold and falls back when Route is capped", () => {
    const s = automationState();
    s.run.gold = D("1e10000");
    s.automation.reserveGold = D("1e9990");
    autoPurchase(s);
    expect(s.run.upgrades.delay).toBe(30);
    expect(s.run.upgrades.atk).toBeGreaterThan(100000);
    expect(s.run.gold.gte(s.automation.reserveGold)).toBe(true);
    expect(autoPurchaseOrder(s)).toEqual(["atk"]);
  });
  it("rejects injected saved passive levels and invalid/locked AUTO ROUTE", () => {
    const raw = JSON.parse(encode(initialState()));
    raw.run.upgrades.crit = 12;
    expect(() => decode(JSON.stringify(raw))).toThrow();
    delete raw.run.upgrades.crit;
    raw.automation.routeEnabled = true;
    expect(() => decode(JSON.stringify(raw))).toThrow();
    for (const bad of [null, "yes", 1]) {
      raw.automation.routeEnabled = bad;
      expect(() => decode(JSON.stringify(raw))).toThrow();
    }
    expect(BALANCE.version).toBe("speed-7");
  });
});
