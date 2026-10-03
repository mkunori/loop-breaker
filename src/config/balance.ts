export const BALANCE = {
  version: "prototype-2",
  hp: {
    normal: 30,
    boss: 120,
    normalCount: 4,
    growth: 1.002,
    deepGrowth: 1.02,
    deepStart: 100,
  },
  damage: { base: 10, growth: 1.16, power: 0.7 },
  speedGrowth: 1.25,
  critChance: 0.1,
  critMultiplier: 3,
  overkill: 0.15,
  delay: { base: 6, compression: 0.6, tempo: 0.85 },
  gold: { base: 10, wealth: 0.55, stageStep: 0.0005, stageCap: 100 },
  mastery: [1, 0.55, 0.36] as const,
  caps: { first: 1, speed: 8, crit: 8, overkill: 8, delay: 30, cadence: 2 },
  upgrades: {
    atk: { label: "ATK", base: 25, growth: 1.15, unlock: 0 },
    speed: { label: "Attack Speed", base: 10, growth: 2.2, unlock: 6 },
    crit: { label: "Critical", base: 10, growth: 2.2, unlock: 20 },
    overkill: { label: "Overkill", base: 10, growth: 2.2, unlock: 35 },
    delay: { label: "Route Compression", base: 10, growth: 1.8, unlock: 65 },
  },
  soul: { base: 4, exponent: 1.5, secondBonus: 4, costGrowth: 1.7 },
  permanent: {
    power: { label: "POWER", base: 1 },
    wealth: { label: "WEALTH", base: 1 },
    tempo: { label: "TEMPO", base: 2 },
  },
  stage: {
    numerator: 12,
    denominator: 5,
    firstTarget: 100,
    step: 50,
    deepen: 25,
  },
  autoUnlock: 120,
  autoInterval: 1,
  burst: { enter: 1, exit: 1.1, window: 5 },
  limits: {
    level: 1e6,
    stage: 1e9,
    exponent: 1e9,
    exactCount: Number.MAX_SAFE_INTEGER,
  },
} as const;
export type UpgradeId = keyof typeof BALANCE.upgrades;
export type PermanentId = keyof typeof BALANCE.permanent;
export const UPGRADE_IDS = Object.keys(BALANCE.upgrades) as UpgradeId[];
export const PERMANENT_IDS = Object.keys(BALANCE.permanent) as PermanentId[];

export function validateBalance(config = BALANCE): void {
  const fail = () => {
    throw new Error("balance設定が不正です");
  };
  const numbers = (value: unknown): void => {
    if (typeof value === "number" && (!Number.isFinite(value) || value < 0))
      fail();
    else if (value && typeof value === "object")
      Object.values(value).forEach(numbers);
  };
  numbers(config);
  for (const n of [
    config.hp.growth,
    config.hp.deepGrowth,
    config.damage.growth,
    config.speedGrowth,
    config.soul.costGrowth,
    ...Object.values(config.upgrades).map((u) => u.growth),
  ])
    if (n <= 1) fail();
  for (const n of [
    config.hp.normal,
    config.hp.boss,
    config.damage.base,
    config.delay.base,
    config.gold.base,
    config.burst.enter,
    config.autoInterval,
    ...Object.values(config.upgrades).map((u) => u.base),
  ])
    if (n <= 0) fail();
  for (const n of [
    config.hp.normalCount,
    config.hp.deepStart,
    config.gold.stageCap,
    config.stage.denominator,
    config.stage.numerator,
    config.stage.firstTarget,
    config.stage.step,
    config.stage.deepen,
    config.caps.cadence,
  ])
    if (!Number.isSafeInteger(n) || n < 1) fail();
  for (const n of [
    config.delay.compression,
    config.delay.tempo,
    ...config.mastery,
  ])
    if (n <= 0 || n > 1) fail();
  if (
    config.critChance * config.caps.crit > 1 ||
    config.critMultiplier < 1 ||
    config.burst.exit <= config.burst.enter ||
    config.burst.window <= 0 ||
    config.stage.numerator < config.stage.denominator
  )
    fail();
}
validateBalance();
