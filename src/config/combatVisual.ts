import type { Big } from "../game/number";
export const COMBAT_VISUAL = {
  normalSeconds: 1,
  fastSeconds: 0.1,
  normalPeriod: "1s",
  fastPeriod: "0.25s",
} as const;
export function combatLod(seconds: Big, burst: boolean) {
  if (burst) return "burst";
  if (seconds.gte(COMBAT_VISUAL.normalSeconds)) return "normal";
  if (seconds.gte(COMBAT_VISUAL.fastSeconds)) return "fast";
  return "ultra";
}
