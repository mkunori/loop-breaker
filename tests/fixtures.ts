import { D } from "../src/game/number";
import { encode } from "../src/game/save";
import { initialState } from "../src/game/state";
export function fixture(kind: "gold" | "prestige" | "burst" = "gold"): string {
  const s = initialState();
  s.run.gold = D(100);
  if (kind !== "gold") {
    s.run.routeClears = 496;
    s.run.clears = D(496);
    s.run.highestClearedStage = 100;
    s.stats.totalClears = D(496);
    s.stats.highestStage = 100;
    s.stats.totalGoldEarned = D(2500);
    s.run.upgrades = { atk: 19, speed: 1, crit: 1, overkill: 1, delay: 1 };
    for (const id of Object.keys(
      s.meta.unlocks,
    ) as (keyof typeof s.meta.unlocks)[])
      s.meta.unlocks[id] = true;
    s.automation.atkEnabled = true;
    s.automation.reserveGold = D(50);
  }
  if (kind === "burst") {
    s.meta.prestigeCount = 3;
    s.meta.upgrades = { power: 3, wealth: 2, tempo: 2 };
    s.run.targetStage = 150;
    s.run.upgrades = { atk: 80, speed: 3, crit: 2, overkill: 2, delay: 12 };
    s.run.burst = { active: true, seconds: 2, clears: D(3), gold: D(50) };
    s.run.phase = 0.25;
  }
  return encode(s, "2026-10-03T00:00:00.000Z");
}

// Recreates the reported speed-4 play state under the current test balance.
// Not a production Save migration. Unspecified phase/reserve are zero.
export function prestige17State() {
  const s = initialState();
  s.meta.prestigeCount = 17;
  s.meta.upgrades = { power: 10, wealth: 9, tempo: 9 };
  for (const id of Object.keys(
    s.meta.unlocks,
  ) as (keyof typeof s.meta.unlocks)[])
    s.meta.unlocks[id] = true;
  s.run.targetStage = 850;
  s.run.routeClears = 4030;
  s.run.highestClearedStage = 806;
  s.run.clears = D(4030);
  s.run.gold = D(6538);
  s.run.upgrades = { atk: 55, speed: 8, crit: 8, overkill: 8, delay: 6 };
  s.stats.totalClears = D(4030);
  s.stats.highestStage = 806;
  s.stats.totalGoldEarned = D(1e6);
  s.automation.atkEnabled = true;
  s.automation.autoAdvanceEnabled = true;
  return s;
}
