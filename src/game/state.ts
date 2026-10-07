import { BALANCE, type PermanentId, type UpgradeId } from "../config/balance";
import { type Big, D } from "./number";
export interface BurstResult {
  seconds: number;
  clears: Big;
  gold: Big;
  partial: boolean;
}
export interface GameState {
  run: {
    targetStage: number;
    gold: Big;
    clears: Big;
    routeClears: number;
    phase: number;
    activeSeconds: number;
    highestClearedStage: number;
    upgrades: Record<UpgradeId, number>;
    approximateClears: boolean;
    autoClock: number;
    burst: { active: boolean; seconds: number; clears: Big; gold: Big };
  };
  meta: {
    prestigeCount: number;
    deepMasteryLevel: number;
    soul: Big;
    upgrades: Record<PermanentId, number>;
    unlocks: Record<Exclude<UpgradeId, "atk"> | "autoAtk" | "burst", boolean>;
  };
  automation: {
    atkEnabled: boolean;
    reserveGold: Big;
    autoAdvanceEnabled: boolean;
  };
  stats: {
    totalClears: Big;
    totalGoldEarned: Big;
    fastestClear: Big | null;
    fastestClearStage: number | null;
    highestStage: number;
    bestBurstClears: Big;
    activeSeconds: number;
    approximateClears: boolean;
  };
  settings: { sound: boolean; reducedMotion: boolean };
}
export function initialState(): GameState {
  return {
    run: {
      targetStage: BALANCE.stage.firstTarget,
      gold: D(0),
      clears: D(0),
      routeClears: 0,
      phase: 0,
      activeSeconds: 0,
      highestClearedStage: 0,
      upgrades: { atk: 0, speed: 0, crit: 0, overkill: 0, delay: 0 },
      approximateClears: false,
      autoClock: 0,
      burst: { active: false, seconds: 0, clears: D(0), gold: D(0) },
    },
    meta: {
      prestigeCount: 0,
      deepMasteryLevel: 0,
      soul: D(0),
      upgrades: { power: 0, wealth: 0, tempo: 0 },
      unlocks: {
        speed: false,
        crit: false,
        overkill: false,
        delay: false,
        autoAtk: false,
        burst: false,
      },
    },
    automation: {
      atkEnabled: false,
      reserveGold: D(0),
      autoAdvanceEnabled: false,
    },
    stats: {
      totalClears: D(0),
      totalGoldEarned: D(0),
      fastestClear: null,
      fastestClearStage: null,
      highestStage: 0,
      bestBurstClears: D(0),
      activeSeconds: 0,
      approximateClears: false,
    },
    settings: { sound: false, reducedMotion: false },
  };
}
export function cloneState(s: GameState): GameState {
  return {
    ...s,
    run: {
      ...s.run,
      upgrades: { ...s.run.upgrades },
      burst: { ...s.run.burst },
    },
    meta: {
      ...s.meta,
      upgrades: { ...s.meta.upgrades },
      unlocks: { ...s.meta.unlocks },
    },
    automation: { ...s.automation },
    stats: { ...s.stats },
    settings: { ...s.settings },
  };
}
