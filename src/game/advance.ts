import { BALANCE, UPGRADE_IDS } from "../config/balance";
import {
  boundary,
  bulkPrice,
  cap,
  clearTime,
  type Diagnostics,
  goldPerClear,
  maxBuy,
  rangeTotals,
  stageAt,
} from "./math";
import { type Big, D, splitWork, validBig } from "./number";
import { type BurstResult, cloneState, type GameState } from "./state";
export type GameEvent =
  | { kind: "unlock"; label: string }
  | { kind: "burst"; result: BurstResult };
export function closeBurst(
  s: GameState,
  partial: boolean,
  events: GameEvent[],
): void {
  const b = s.run.burst;
  if (b.seconds > 0) {
    events.push({
      kind: "burst",
      result: { seconds: b.seconds, clears: b.clears, gold: b.gold, partial },
    });
    if (!partial && b.clears.gt(s.stats.bestBurstClears))
      s.stats.bestBurstClears = b.clears;
  }
  b.seconds = 0;
  b.clears = D(0);
  b.gold = D(0);
}
export function reconcileMode(s: GameState, events: GameEvent[] = []): void {
  const t = clearTime(s);
  if (!validBig(t) || t.eq(0))
    throw new Error("数値保護限界に達しました。SaveをExportしてください。");
  if (!s.run.burst.active && t.lt(BALANCE.burst.enter)) {
    s.run.burst.active = true;
    if (!s.meta.unlocks.burst) {
      s.meta.unlocks.burst = true;
      events.push({ kind: "unlock", label: "BURST MODE" });
    }
  } else if (s.run.burst.active && t.gte(BALANCE.burst.exit)) {
    closeBurst(s, true, events);
    s.run.burst.active = false;
  }
}
function award(
  s: GameState,
  count: Big,
  gold: Big,
  firstStage: number,
  lastStage: number,
  approximate = false,
): void {
  if (count.eq(0)) return;
  s.run.clears = s.run.clears.add(count);
  s.run.gold = s.run.gold.add(gold);
  s.stats.totalClears = s.stats.totalClears.add(count);
  s.stats.totalGoldEarned = s.stats.totalGoldEarned.add(gold);
  s.run.highestClearedStage = Math.max(s.run.highestClearedStage, lastStage);
  s.stats.highestStage = Math.max(s.stats.highestStage, lastStage);
  const fastest = clearTime(s, firstStage);
  if (!s.stats.fastestClear || fastest.lt(s.stats.fastestClear)) {
    s.stats.fastestClear = fastest;
    s.stats.fastestClearStage = firstStage;
  }
  s.run.approximateClears ||= approximate;
  s.stats.approximateClears ||= approximate;
  if (s.run.burst.active) {
    s.run.burst.clears = s.run.burst.clears.add(count);
    s.run.burst.gold = s.run.burst.gold.add(gold);
  }
}
function unlocks(s: GameState, events: GameEvent[]): void {
  for (const id of UPGRADE_IDS) {
    if (
      id !== "atk" &&
      !s.meta.unlocks[id] &&
      s.run.clears.gte(BALANCE.upgrades[id].unlock)
    ) {
      s.meta.unlocks[id] = true;
      events.push({ kind: "unlock", label: BALANCE.upgrades[id].label });
    }
  }
  if (!s.meta.unlocks.autoAtk && s.run.clears.gte(BALANCE.autoUnlock)) {
    s.meta.unlocks.autoAtk = true;
    events.push({ kind: "unlock", label: "AUTO ATK" });
  }
}
// Ability/Stage increases monotonically within this interval. Limit at the first
// Stage where BURST must exit, so even a fast Stage jump preserves window timing.
function untilModeExit(s: GameState, diag: Diagnostics): number {
  if (
    !s.run.burst.active ||
    clearTime(s, s.run.targetStage).lt(BALANCE.burst.exit)
  )
    return Infinity;
  let lo = stageAt(s) + 1,
    hi = s.run.targetStage;
  while (lo < hi) {
    diag.stageComparisons++;
    const mid = Math.floor((lo + hi) / 2);
    if (clearTime(s, mid).gte(BALANCE.burst.exit)) hi = mid;
    else lo = mid + 1;
  }
  const end = boundary(lo),
    start = s.run.routeClears;
  if (end <= start) return Infinity;
  return clearTime(s)
    .mul(1 - s.run.phase)
    .add(rangeTotals(s, start + 1, end, diag).time)
    .toNumber();
}
function integrate(s: GameState, seconds: number, diag: Diagnostics): void {
  diag.segments++;
  let remaining = D(seconds);
  const routeEnd = boundary(s.run.targetStage) + 1;
  // Resolve a single incomplete RUN; all later RUNs are aggregated.
  const firstStage = stageAt(s),
    firstTime = clearTime(s);
  if (s.run.routeClears < routeEnd) {
    const partialTime = firstTime.mul(1 - s.run.phase);
    if (remaining.lt(partialTime)) {
      const partial = splitWork(D(s.run.phase).add(remaining.div(firstTime)));
      s.run.phase = partial.phase;
      if (partial.count.gt(0)) {
        award(s, D(1), goldPerClear(s, firstStage), firstStage, firstStage);
        s.run.routeClears++;
      }
      return;
    }
    remaining = remaining.sub(partialTime);
    s.run.phase = 0;
    award(s, D(1), goldPerClear(s, firstStage), firstStage, firstStage);
    s.run.routeClears++;
    const start = s.run.routeClears;
    let lo = start,
      hi = routeEnd;
    while (lo < hi) {
      diag.stageComparisons++;
      const mid = Math.ceil((lo + hi) / 2);
      if (rangeTotals(s, start, mid, diag).time.lte(remaining)) lo = mid;
      else hi = mid - 1;
    }
    if (lo > start) {
      const totals = rangeTotals(s, start, lo, diag);
      const first = stageAt(s),
        last = Math.min(
          s.run.targetStage,
          1 +
            Math.floor(
              ((lo - 1) * BALANCE.stage.denominator) / BALANCE.stage.numerator,
            ),
        );
      remaining = remaining.sub(totals.time);
      award(s, D(lo - start), totals.gold, first, last);
      s.run.routeClears = lo;
    }
  }
  const currentStage = stageAt(s);
  const work = D(s.run.phase).add(remaining.div(clearTime(s, currentStage)));
  const result = splitWork(work);
  award(
    s,
    result.count,
    goldPerClear(s, currentStage).mul(result.count),
    currentStage,
    currentStage,
    result.approximate,
  );
  s.run.phase = result.phase;
  // A last boundary may round upward by one RUN; keep the route counter aligned.
  if (s.run.routeClears < routeEnd && result.count.gt(0)) {
    if (result.count.gt(1)) throw new Error("経路積分の境界が不正です");
    s.run.routeClears++;
  }
}
export function advance(
  input: GameState,
  elapsed: number,
): { state: GameState; events: GameEvent[]; diagnostics: Diagnostics } {
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 5)
    throw new Error("elapsedは0〜5秒で指定してください");
  const s = cloneState(input),
    events: GameEvent[] = [],
    diag: Diagnostics = { segments: 0, stageComparisons: 0, formulaGroups: 0 };
  let left = elapsed;
  reconcileMode(s, events);
  while (left > 0) {
    const untilAuto = BALANCE.autoInterval - s.run.autoClock;
    const untilBurst = s.run.burst.active
      ? BALANCE.burst.window - s.run.burst.seconds
      : Infinity;
    const dt = Math.min(left, untilAuto, untilBurst, untilModeExit(s, diag));
    if (dt <= 0) {
      reconcileMode(s, events);
      throw new Error("時間境界が収束しません");
    }
    integrate(s, dt, diag);
    s.run.activeSeconds += dt;
    s.stats.activeSeconds += dt;
    s.run.autoClock += dt;
    if (s.run.burst.active) s.run.burst.seconds += dt;
    left = Math.max(0, left - dt);
    unlocks(s, events);
    if (
      s.run.burst.active &&
      s.run.burst.seconds >=
        BALANCE.burst.window - 8 * Number.EPSILON * BALANCE.burst.window
    )
      closeBurst(s, false, events);
    if (
      s.run.autoClock >=
      BALANCE.autoInterval - 8 * Number.EPSILON * BALANCE.autoInterval
    ) {
      s.run.autoClock = 0;
      if (s.automation.atkEnabled && s.meta.unlocks.autoAtk) {
        const budget = s.run.gold.sub(s.automation.reserveGold).max(0);
        const n = maxBuy(
          "atk",
          s.run.upgrades.atk,
          budget,
          cap("atk", s.meta.prestigeCount),
        );
        s.run.gold = s.run.gold.sub(bulkPrice("atk", s.run.upgrades.atk, n));
        s.run.upgrades.atk += n;
      }
    }
    reconcileMode(s, events);
  }
  if (
    !validBig(s.run.gold) ||
    !validBig(s.stats.totalClears) ||
    !validBig(s.stats.totalGoldEarned)
  )
    throw new Error("数値保護限界に達しました。SaveをExportしてください。");
  return { state: s, events, diagnostics: diag };
}
