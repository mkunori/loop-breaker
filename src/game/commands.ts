import { BALANCE, type PermanentId, type UpgradeId } from "../config/balance";
import { closeBurst, type GameEvent, reconcileMode } from "./advance";
import {
  bulkPrice,
  canDeepen,
  canPrestige,
  cap,
  maxBuy,
  price,
  requiredStage,
  soulPrice,
  soulReward,
  unlocked,
} from "./math";
import { type Big, D, validBig } from "./number";
import { cloneState, type GameState, initialState } from "./state";
export type Command =
  | { type: "buy"; id: UpgradeId; max?: boolean }
  | { type: "permanent"; id: PermanentId }
  | { type: "prestige"; expectedCount: number }
  | { type: "deepen" }
  | { type: "auto"; enabled: boolean; reserve: Big }
  | { type: "settings"; sound: boolean; reducedMotion: boolean };
export function command(
  input: GameState,
  cmd: Command,
): { state: GameState; events: GameEvent[] } {
  const s = cloneState(input),
    events: GameEvent[] = [];
  if (cmd.type === "buy") {
    const level = s.run.upgrades[cmd.id],
      upper = cap(cmd.id, s.meta.prestigeCount);
    if (unlocked(s, cmd.id) && level < upper) {
      const n = cmd.max
        ? maxBuy(cmd.id, level, s.run.gold, upper)
        : Number(s.run.gold.gte(price(cmd.id, level)));
      s.run.gold = s.run.gold.sub(bulkPrice(cmd.id, level, n));
      s.run.upgrades[cmd.id] += n;
    }
  } else if (cmd.type === "permanent") {
    const level = s.meta.upgrades[cmd.id],
      cost = soulPrice(cmd.id, level);
    if (level < BALANCE.limits.level && s.meta.soul.gte(cost)) {
      s.meta.soul = s.meta.soul.sub(cost);
      s.meta.upgrades[cmd.id]++;
    }
  } else if (cmd.type === "prestige") {
    if (cmd.expectedCount !== s.meta.prestigeCount || !canPrestige(s))
      return { state: s, events };
    const next = requiredStage(s.meta.prestigeCount + 1);
    if (next > BALANCE.limits.stage)
      throw new Error("Stage保護限界に達しました");
    closeBurst(s, true, events);
    s.meta.soul = s.meta.soul.add(soulReward(s));
    s.meta.prestigeCount++;
    s.run = initialState().run;
    s.run.targetStage = next;
    events.push({
      kind: "unlock",
      label:
        s.meta.prestigeCount <= 2
          ? `LOOP MASTERY / BREAK ${s.meta.prestigeCount === 1 ? "I" : "II"}`
          : "通常強化の上限アップ / LOOP MASTERY 継続短縮",
    });
  } else if (cmd.type === "deepen") {
    if (!canDeepen(s)) return { state: s, events };
    if (s.run.targetStage + BALANCE.stage.deepen > BALANCE.limits.stage)
      throw new Error("Stage保護限界に達しました");
    s.run.targetStage += BALANCE.stage.deepen;
  } else if (cmd.type === "auto") {
    if (!validBig(cmd.reserve)) throw new Error("予約Goldが不正です");
    s.automation.reserveGold = D(cmd.reserve);
    s.automation.atkEnabled = cmd.enabled && s.meta.unlocks.autoAtk;
  } else s.settings = { sound: cmd.sound, reducedMotion: cmd.reducedMotion };
  reconcileMode(s, events);
  if (!validBig(s.run.gold) || !validBig(s.meta.soul))
    throw new Error("通貨が数値保護限界に達しました");
  return { state: s, events };
}
