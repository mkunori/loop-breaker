import { advance } from "../src/game/advance";
import { command } from "../src/game/commands";
import {
  canPrestige,
  clearTime,
  soulPrice,
  soulReward,
} from "../src/game/math";
import { initialState } from "../src/game/state";

export function playModel(model: "active" | "casual" | "auto", cycles = 12) {
  let s = initialState();
  let total = 0;
  let burst: number | null = null;
  let autoAt = 0;
  const milestones: Record<string, number> = {};
  const times: number[] = [];
  const checkpoints: Record<number, number> = {};
  for (let cycle = 0; cycle < cycles; cycle++) {
    let seconds = 0;
    while (
      (!canPrestige(s) || (cycle === 2 && burst === null)) &&
      seconds < 7200
    ) {
      // AUTO uses the production second-boundary purchase. Manual purchases
      // before its unlock and both other models have the same decision cadence.
      if (model === "auto" && s.meta.unlocks.autoAtk)
        s.automation.atkEnabled = true;
      s = advance(s, 1).state;
      seconds++;
      total++;
      if (!autoAt && s.meta.unlocks.autoAtk) autoAt = total;
      if (model === "active" || (model === "casual" && seconds % 60 === 0))
        for (const id of ["speed", "crit", "overkill", "delay"] as const)
          s = command(s, { type: "buy", id, max: true }).state;
      if (model !== "auto" || !s.meta.unlocks.autoAtk)
        s = command(s, { type: "buy", id: "atk", max: true }).state;
      const time = clearTime(s).toNumber();
      if (cycle === 0 && [60, 120, 180].includes(seconds))
        checkpoints[seconds] = time;
      for (const threshold of [1, 0.1, 0.01, 0.001])
        if (time < threshold && !(threshold in milestones))
          milestones[threshold] = total;
      if (s.meta.unlocks.burst && burst === null) burst = total;
    }
    if (!canPrestige(s))
      throw new Error("reference cycle did not reach target");
    times.push(seconds);
    const expectedSoul = s.meta.soul.add(soulReward(s));
    s = command(s, { type: "prestige", expectedCount: cycle }).state;
    if (!s.meta.soul.eq(expectedSoul))
      throw new Error("Prestige SOUL ledger mismatch");
    for (let purchases = 0; purchases < 100; purchases++) {
      const id = (["power", "wealth", "tempo"] as const).reduce((a, b) =>
        s.meta.upgrades[b] < s.meta.upgrades[a] ? b : a,
      );
      if (s.meta.soul.lt(soulPrice(id, s.meta.upgrades[id]))) break;
      s = command(s, { type: "permanent", id }).state;
    }
  }
  return { times, burst, autoAt, milestones, checkpoints, state: s };
}
