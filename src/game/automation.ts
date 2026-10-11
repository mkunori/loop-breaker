import type { UpgradeId } from "../config/balance";
import {
  autoRouteUnlocked,
  bulkPrice,
  cap,
  clearTime,
  maxBuy,
  price,
  unlocked,
} from "./math";
import { cloneState, type GameState } from "./state";

// Fixed two-candidate comparison. Never loop per purchased level or CLEAR.
export function autoPurchaseOrder(s: GameState): UpgradeId[] {
  const ids: UpgradeId[] = [];
  if (
    s.automation.atkEnabled &&
    s.meta.unlocks.autoAtk &&
    s.run.upgrades.atk < cap("atk", s.meta.prestigeCount)
  )
    ids.push("atk");
  if (
    s.automation.routeEnabled &&
    autoRouteUnlocked(s) &&
    unlocked(s, "delay") &&
    s.run.upgrades.delay < cap("delay", s.meta.prestigeCount)
  )
    ids.push("delay");
  if (ids.length < 2) return ids;
  const before = clearTime(s);
  const score = (id: UpgradeId) => {
    const after = cloneState(s);
    after.run.upgrades[id]++;
    return before
      .sub(clearTime(after))
      .max(0)
      .div(price(id, s.run.upgrades[id]));
  };
  if (score("delay").gt(score("atk"))) ids.reverse();
  // Protect the more efficient purchase from the other MAX spender.
  if (
    s.run.gold
      .sub(s.automation.reserveGold)
      .lt(price(ids[0], s.run.upgrades[ids[0]]))
  )
    return [];
  return ids;
}
export function autoPurchase(s: GameState): void {
  for (const id of autoPurchaseOrder(s)) {
    const n = maxBuy(
      id,
      s.run.upgrades[id],
      s.run.gold.sub(s.automation.reserveGold).max(0),
      cap(id, s.meta.prestigeCount),
    );
    s.run.gold = s.run.gold.sub(bulkPrice(id, s.run.upgrades[id], n));
    s.run.upgrades[id] += n;
  }
}
