import { BALANCE, PERMANENT_IDS, UPGRADE_IDS } from "../config/balance";
import { PRESENTATION } from "../config/presentation";
import { boundary, cap, requiredStage, stageAt } from "./math";
import { type Big, D, scientific, validBig } from "./number";
import { type GameState, initialState } from "./state";
export const SAVE_VERSION = 1;
type JsonObject = Record<string, unknown>;
const object = (v: unknown): JsonObject => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("Saveの構造が不正です");
  return v as JsonObject;
};
function numeric(
  v: unknown,
  min: number,
  max: number,
  integer = false,
): number {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isSafeInteger(v))
  )
    throw new Error("Saveの数値が不正です");
  return v;
}
function boolean(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("Saveのフラグが不正です");
  return v;
}
function big(v: unknown): Big {
  if (
    typeof v !== "string" ||
    v.length > 64 ||
    !/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(v)
  )
    throw new Error("Saveの巨大数が不正です");
  const result = D(v);
  if (!validBig(result)) throw new Error("Saveの巨大数が範囲外です");
  return result;
}
export type Migration = (value: JsonObject) => JsonObject;
export function migrate(
  value: unknown,
  migrations: Record<number, Migration> = {},
): JsonObject {
  let root = object(value),
    version = numeric(root.saveVersion, 0, Number.MAX_SAFE_INTEGER, true);
  if (version > SAVE_VERSION)
    throw new Error("新しいSave Versionです。このバージョンでは読み込めません");
  while (version < SAVE_VERSION) {
    const transform = migrations[version];
    if (!transform) throw new Error("対応していない旧Save Versionです");
    root = transform(root);
    const next = numeric(root.saveVersion, version + 1, SAVE_VERSION, true);
    version = next;
  }
  return root;
}
export function decode(text: string): GameState {
  if (new TextEncoder().encode(text).length > PRESENTATION.importBytes)
    throw new Error("Saveは32KB以内にしてください");
  const root = migrate(JSON.parse(text));
  if (
    typeof root.balanceVersion !== "string" ||
    root.balanceVersion.length > 100 ||
    typeof root.savedAt !== "string" ||
    !Number.isFinite(Date.parse(root.savedAt))
  )
    throw new Error("SaveのVersion/日時が不正です");
  const s = initialState(),
    r = object(root.run),
    m = object(root.meta),
    st = object(root.stats),
    a = object(root.automation),
    settings = object(root.settings);
  s.meta.prestigeCount = numeric(
    m.prestigeCount,
    0,
    Math.floor(
      (BALANCE.limits.stage - BALANCE.stage.firstTarget) / BALANCE.stage.step,
    ) + 2,
    true,
  );
  s.meta.soul = big(m.soul);
  const mu = object(m.upgrades),
    ru = object(r.upgrades),
    flags = object(m.unlocks);
  for (const id of PERMANENT_IDS)
    s.meta.upgrades[id] = numeric(mu[id], 0, BALANCE.limits.level, true);
  for (const id of UPGRADE_IDS)
    s.run.upgrades[id] = numeric(
      ru[id],
      0,
      cap(id, s.meta.prestigeCount),
      true,
    );
  for (const id of Object.keys(
    s.meta.unlocks,
  ) as (keyof typeof s.meta.unlocks)[])
    s.meta.unlocks[id] = boolean(flags[id]);
  for (const id of UPGRADE_IDS)
    if (id !== "atk" && s.run.upgrades[id] > 0 && !s.meta.unlocks[id])
      throw new Error("未解禁のUpgradeが含まれています");
  s.run.targetStage = numeric(
    r.targetStage,
    requiredStage(s.meta.prestigeCount),
    BALANCE.limits.stage,
    true,
  );
  s.run.gold = big(r.gold);
  s.run.clears = big(r.clears);
  if (
    root.balanceVersion === "prototype-2" ||
    root.balanceVersion === "speed-3"
  ) {
    const legacy = root.balanceVersion === "prototype-2";
    const oldNumerator = legacy ? 12 : 40;
    const oldDenominator = legacy ? 5 : 1;
    const oldBoundary = (stage: number) =>
      Math.ceil((oldNumerator * (stage - 1)) / oldDenominator);
    const route = numeric(
      r.routeClears,
      0,
      oldBoundary(s.run.targetStage) + 1,
      true,
    );
    const oldStage = Math.min(
      s.run.targetStage,
      1 + Math.floor((route * oldDenominator) / oldNumerator),
    );
    const oldHighest =
      route === 0
        ? 0
        : Math.min(
            s.run.targetStage,
            1 + Math.floor(((route - 1) * oldDenominator) / oldNumerator),
          );
    if (
      (legacy && s.run.clears.lt(route)) ||
      r.highestClearedStage !== oldHighest
    )
      throw new Error("旧Saveの経路進行が不正です");
    // Preserve Stage and intra-Stage route position, never award imaginary CLEAR/Gold.
    r.routeClears =
      route > oldBoundary(s.run.targetStage)
        ? boundary(s.run.targetStage) + 1
        : boundary(oldStage) +
          (route === oldBoundary(oldStage)
            ? 0
            : Math.max(
                1,
                Math.floor(
                  ((route - oldBoundary(oldStage)) *
                    (boundary(oldStage + 1) - boundary(oldStage))) /
                    (oldBoundary(oldStage + 1) - oldBoundary(oldStage)),
                ),
              ));
  }
  s.run.routeClears = numeric(
    r.routeClears,
    0,
    boundary(s.run.targetStage) + 1,
    true,
  );
  s.run.phase = numeric(r.phase, 0, 1 - Number.EPSILON);
  s.run.activeSeconds = numeric(r.activeSeconds, 0, Number.MAX_SAFE_INTEGER);
  s.run.highestClearedStage = numeric(
    r.highestClearedStage,
    0,
    stageAt(s),
    true,
  );
  const actualHighest =
    s.run.routeClears === 0
      ? 0
      : Math.min(
          s.run.targetStage,
          1 +
            Math.floor(
              ((s.run.routeClears - 1) * BALANCE.stage.denominator) /
                BALANCE.stage.numerator,
            ),
        );
  if (actualHighest !== s.run.highestClearedStage)
    throw new Error("攻略Stageと経路進行が一致しません");
  s.run.approximateClears = boolean(r.approximateClears);
  s.run.autoClock = numeric(
    r.autoClock,
    0,
    BALANCE.autoInterval - Number.EPSILON,
  );
  const b = object(r.burst);
  s.run.burst = {
    active: boolean(b.active),
    seconds: numeric(
      b.seconds,
      0,
      BALANCE.burst.window - Number.EPSILON * BALANCE.burst.window,
    ),
    clears: big(b.clears),
    gold: big(b.gold),
  };
  if (
    !s.run.burst.active &&
    (s.run.burst.seconds !== 0 ||
      !s.run.burst.clears.eq(0) ||
      !s.run.burst.gold.eq(0))
  )
    throw new Error("BURSTの途中状態が不正です");
  s.automation = {
    atkEnabled: boolean(a.atkEnabled),
    reserveGold: big(a.reserveGold),
  };
  if (s.automation.atkEnabled && !s.meta.unlocks.autoAtk)
    throw new Error("未解禁のAUTO設定です");
  s.stats.totalClears = big(st.totalClears);
  s.stats.totalGoldEarned = big(st.totalGoldEarned);
  s.stats.highestStage = numeric(
    st.highestStage,
    s.run.highestClearedStage,
    BALANCE.limits.stage,
    true,
  );
  s.stats.activeSeconds = numeric(
    st.activeSeconds,
    s.run.activeSeconds,
    Number.MAX_SAFE_INTEGER,
  );
  s.stats.bestBurstClears = big(st.bestBurstClears);
  s.stats.approximateClears = boolean(st.approximateClears);
  s.stats.fastestClear = st.fastestClear === null ? null : big(st.fastestClear);
  s.stats.fastestClearStage =
    st.fastestClearStage === null
      ? null
      : numeric(st.fastestClearStage, 1, s.stats.highestStage, true);
  if (
    (s.stats.fastestClear === null) !== (s.stats.fastestClearStage === null) ||
    s.stats.fastestClear?.eq(0) ||
    s.stats.totalClears.lt(s.run.clears)
  )
    throw new Error("統計が不正です");
  s.settings = {
    sound: boolean(settings.sound),
    reducedMotion: boolean(settings.reducedMotion),
  };
  return s;
}
export function encode(
  s: GameState,
  savedAt = new Date().toISOString(),
): string {
  const text = JSON.stringify({
    saveVersion: SAVE_VERSION,
    balanceVersion: BALANCE.version,
    savedAt,
    run: {
      ...s.run,
      stage: stageAt(s),
      gold: scientific(s.run.gold),
      clears: scientific(s.run.clears),
      burst: {
        ...s.run.burst,
        clears: scientific(s.run.burst.clears),
        gold: scientific(s.run.burst.gold),
      },
    },
    meta: { ...s.meta, soul: scientific(s.meta.soul) },
    automation: {
      ...s.automation,
      reserveGold: scientific(s.automation.reserveGold),
    },
    stats: {
      ...s.stats,
      totalClears: scientific(s.stats.totalClears),
      totalGoldEarned: scientific(s.stats.totalGoldEarned),
      fastestClear:
        s.stats.fastestClear === null ? null : scientific(s.stats.fastestClear),
      bestBurstClears: scientific(s.stats.bestBurstClears),
    },
    settings: s.settings,
  });
  decode(text);
  if (new TextEncoder().encode(text).length > PRESENTATION.saveBytes)
    throw new Error("Saveのサイズ上限を超えました");
  return text;
}
