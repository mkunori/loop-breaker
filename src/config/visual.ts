// Presentation only: no imports from game math, state, balance or persistence.
const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
const zone = (id: string, fromStage: number) => ({
  id,
  fromStage,
  background: asset(`backgrounds/background-zone-${id}.webp`),
  enemy: asset(`enemies/enemy-zone-${id}.webp`),
  boss: asset(`bosses/boss-zone-${id}.webp`),
});
export const VISUAL = {
  hero: asset("characters/hero.webp"),
  logo: asset("branding/loop-breaker-logo.webp"),
  zones: [
    zone("01", 1),
    zone("02", 100),
    zone("03", 200),
    zone("04", 350),
    zone("05", 550),
  ],
  masteryNoticeMs: 5000,
} as const;
export function visualForStage(stage: number) {
  for (let i = VISUAL.zones.length - 1; i >= 0; i--)
    if (stage >= VISUAL.zones[i].fromStage) return VISUAL.zones[i];
  return VISUAL.zones[0];
}
