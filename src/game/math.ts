import { BALANCE, type PermanentId, type UpgradeId } from "../config/balance";
import { type Big, D } from "./number";
import type { GameState } from "./state";
export const boundary = (stage: number): number =>
  Math.ceil(
    (BALANCE.stage.numerator * (stage - 1)) / BALANCE.stage.denominator,
  );
export const stageAt = (s: GameState): number =>
  Math.min(
    s.run.targetStage,
    1 +
      Math.floor(
        (s.run.routeClears * BALANCE.stage.denominator) /
          BALANCE.stage.numerator,
      ),
  );
export const requiredStage = (p: number): number =>
  BALANCE.stage.firstTarget + BALANCE.stage.step * Math.max(0, p - 2);
export const mastery = (p: number): number => BALANCE.mastery[Math.min(2, p)];
export function cap(id: UpgradeId, p: number): number {
  if (id === "atk") return BALANCE.limits.level;
  if (id === "delay")
    return Math.min(
      BALANCE.caps.delay,
      BALANCE.caps.delayFirst + BALANCE.caps.delayStep * p,
    );
  if (id === "speed")
    return Math.min(
      BALANCE.caps.speed,
      BALANCE.caps.first + Math.floor((p + 1) / BALANCE.caps.cadence),
    );
  if (id === "crit")
    return Math.min(
      BALANCE.caps.crit,
      BALANCE.caps.first + Math.floor(p / BALANCE.caps.cadence),
    );
  return Math.min(
    BALANCE.caps[id],
    BALANCE.caps.first + Math.floor(Math.max(0, p - 1) / BALANCE.caps.cadence),
  );
}
export const unlocked = (s: GameState, id: UpgradeId): boolean =>
  id === "atk" || s.meta.unlocks[id];
export const damage = (s: GameState): Big =>
  D(BALANCE.damage.base)
    .mul(D(BALANCE.damage.growth).pow(s.run.upgrades.atk))
    .mul(1 + BALANCE.damage.power * s.meta.upgrades.power);
export const dps = (s: GameState): Big =>
  damage(s)
    .mul(D(BALANCE.speedGrowth).pow(s.run.upgrades.speed))
    .mul(
      1 +
        BALANCE.critChance * (BALANCE.critMultiplier - 1) * s.run.upgrades.crit,
    );
export const overkill = (s: GameState): number =>
  1 + BALANCE.overkill * s.run.upgrades.overkill;
export const hp = (stage: number): Big =>
  D(BALANCE.hp.normal * BALANCE.hp.normalCount + BALANCE.hp.boss)
    .mul(D(BALANCE.hp.growth).pow(stage - 1))
    .mul(
      D(BALANCE.hp.deepGrowth).pow(Math.max(0, stage - BALANCE.hp.deepStart)),
    );
export const fixedDelay = (s: GameState): Big =>
  D(BALANCE.delay.base)
    .mul(D(BALANCE.delay.compression).pow(s.run.upgrades.delay))
    .mul(D(BALANCE.delay.tempo).pow(s.meta.upgrades.tempo));
export const clearTime = (s: GameState, stage = stageAt(s)): Big =>
  hp(stage)
    .div(dps(s).mul(overkill(s)))
    .add(fixedDelay(s))
    .mul(mastery(s.meta.prestigeCount));
export const stageGold = (stage: number): number =>
  1 + BALANCE.gold.stageStep * Math.min(stage - 1, BALANCE.gold.stageCap);
export const goldPerClear = (s: GameState, stage = stageAt(s)): Big =>
  D(BALANCE.gold.base)
    .mul(1 + BALANCE.gold.wealth * s.meta.upgrades.wealth)
    .mul(stageGold(stage));
export const price = (id: UpgradeId, level: number): Big =>
  D(BALANCE.upgrades[id].base).mul(D(BALANCE.upgrades[id].growth).pow(level));
export function bulkPrice(id: UpgradeId, level: number, count: number): Big {
  if (count === 0) return D(0);
  if (count === 1) return price(id, level);
  const g = BALANCE.upgrades[id].growth;
  return price(id, level)
    .mul(D(g).pow(count).sub(1))
    .div(g - 1);
}
export function maxBuy(
  id: UpgradeId,
  level: number,
  budget: Big,
  upper: number,
): number {
  if (budget.lt(price(id, level)) || level >= upper) return 0;
  const g = BALANCE.upgrades[id].growth;
  let n = Math.min(
    upper - level,
    Math.max(
      0,
      Math.floor(
        budget
          .mul(g - 1)
          .div(price(id, level))
          .add(1)
          .log10() / Math.log10(g),
      ),
    ),
  );
  // Only rounding corrections, never one iteration per purchased level.
  for (let i = 0; i < 4; i++) {
    if (n > 0 && bulkPrice(id, level, n).gt(budget)) n--;
    else if (n < upper - level && bulkPrice(id, level, n + 1).lte(budget)) n++;
    else return n;
  }
  throw new Error("MAX価格の補正が収束しません");
}
export const soulPrice = (id: PermanentId, level: number): Big =>
  D(BALANCE.permanent[id].base)
    .mul(D(BALANCE.soul.costGrowth).pow(level))
    .ceil();
export const soulReward = (s: GameState): Big =>
  D(BALANCE.soul.base)
    .mul(
      D(s.run.highestClearedStage / BALANCE.stage.firstTarget).pow(
        BALANCE.soul.exponent,
      ),
    )
    .floor()
    .add(s.meta.prestigeCount === 1 ? BALANCE.soul.secondBonus : 0);
export const canPrestige = (s: GameState): boolean =>
  s.run.highestClearedStage >= requiredStage(s.meta.prestigeCount);
export const canDeepen = (s: GameState): boolean =>
  s.meta.prestigeCount >= 3 && s.run.highestClearedStage >= s.run.targetStage;

export interface Diagnostics {
  segments: number;
  stageComparisons: number;
  formulaGroups: number;
}
// Split at HP/Gold formula boundaries; never iterate over every Stage or CLEAR.
function stageSums(
  s: GameState,
  from: number,
  to: number,
  diag?: Diagnostics,
): { time: Big; gold: Big } {
  let weightedHp = D(0),
    weightedGold = D(0),
    count = 0;
  const cuts = [
    ...new Set([
      from,
      BALANCE.hp.deepStart + 1,
      BALANCE.gold.stageCap + 1,
      to + 1,
    ]),
  ]
    .filter((n) => n >= from && n <= to + 1)
    .sort((a, b) => a - b);
  const blocks = cuts.slice(0, -1).map((lo, i) => ({
    lo,
    hi: cuts[i + 1] - 1,
    offset: lo,
    h:
      BALANCE.hp.growth *
      (lo > BALANCE.hp.deepStart ? BALANCE.hp.deepGrowth : 1),
    linear: lo <= BALANCE.gold.stageCap,
  }));
  for (const block of blocks) {
    if (block.lo > block.hi) continue;
    for (
      let first = block.lo;
      first <= Math.min(block.hi, block.lo + BALANCE.stage.denominator - 1);
      first++
    ) {
      if (diag) diag.formulaGroups++;
      const q = boundary(first + 1) - boundary(first);
      const n = Math.floor((block.hi - first) / BALANCE.stage.denominator) + 1;
      const logRatio = Math.log(block.h) * BALANCE.stage.denominator;
      const series =
        logRatio * n < 600
          ? D(Math.expm1(logRatio * n) / Math.expm1(logRatio))
          : D(block.h)
              .pow(BALANCE.stage.denominator * n)
              .sub(1)
              .div(Math.expm1(logRatio));
      weightedHp = weightedHp.add(
        hp(block.offset)
          .mul(D(block.h).pow(first - block.offset))
          .mul(q)
          .mul(series),
      );
      count += q * n;
      const multiplierSum = block.linear
        ? (1 - BALANCE.gold.stageStep) * n +
          (BALANCE.gold.stageStep *
            n *
            (2 * first + BALANCE.stage.denominator * (n - 1))) /
            2
        : stageGold(block.offset) * n;
      weightedGold = weightedGold.add(D(q).mul(multiplierSum));
    }
  }
  return {
    time: weightedHp
      .div(dps(s).mul(overkill(s)))
      .add(fixedDelay(s).mul(count))
      .mul(mastery(s.meta.prestigeCount)),
    gold: weightedGold
      .mul(BALANCE.gold.base)
      .mul(1 + BALANCE.gold.wealth * s.meta.upgrades.wealth),
  };
}
// Half-open range of complete route CLEARs [from,to); no CLEAR-count loop.
export function rangeTotals(
  s: GameState,
  from: number,
  to: number,
  diag?: Diagnostics,
): { time: Big; gold: Big } {
  if (to <= from) return { time: D(0), gold: D(0) };
  const stage = (n: number) =>
    Math.min(
      s.run.targetStage,
      1 + Math.floor((n * BALANCE.stage.denominator) / BALANCE.stage.numerator),
    );
  const first = stage(from),
    last = stage(to - 1);
  if (first === last)
    return {
      time: clearTime(s, first).mul(to - from),
      gold: goldPerClear(s, first).mul(to - from),
    };
  const firstCount = boundary(first + 1) - from,
    lastCount = to - boundary(last);
  const middle = stageSums(s, first + 1, last - 1, diag);
  return {
    time: middle.time
      .add(clearTime(s, first).mul(firstCount))
      .add(clearTime(s, last).mul(lastCount)),
    gold: middle.gold
      .add(goldPerClear(s, first).mul(firstCount))
      .add(goldPerClear(s, last).mul(lastCount)),
  };
}
