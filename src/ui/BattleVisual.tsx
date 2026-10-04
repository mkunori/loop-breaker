import type { CSSProperties } from "react";
import { COMBAT_VISUAL } from "../config/combatVisual";
import { VISUAL, visualForStage } from "../config/visual";
import { AssetImage } from "./AssetImage";

export function BattleVisual({
  lod,
  stage,
  enemyIndex,
  damage,
  hp,
  burst,
  clears,
  gold,
}: {
  lod: "normal" | "fast" | "ultra" | "burst";
  stage: number;
  enemyIndex: number;
  damage: string;
  hp: string;
  burst: boolean;
  clears: string;
  gold: string;
}) {
  const zone = visualForStage(stage),
    boss = enemyIndex === 4;
  return (
    <div
      className={`battle-scene ${burst ? "compressed" : ""}`}
      data-zone={zone.id}
      data-lod={lod}
      style={
        {
          "--attack-period":
            lod === "fast"
              ? COMBAT_VISUAL.fastPeriod
              : COMBAT_VISUAL.normalPeriod,
        } as CSSProperties
      }
      data-testid="battle-scene"
    >
      <AssetImage
        src={zone.background}
        className="scene-background"
        width={960}
        height={540}
        testId="background-image"
      />
      <span className="scene-shade" aria-hidden="true" />
      {burst ? (
        <div className="burst-visual" data-testid="burst-visual">
          <span className="compression-lines" aria-hidden="true" />
          <span className="burst-ring" aria-hidden="true" />
          <div className="burst-count">
            <strong>CLEAR ×{clears}</strong>
            <small>Gold +{gold}</small>
          </div>
        </div>
      ) : (
        <div className="fighters">
          <span className="slash-effect" aria-hidden="true" />
          <span className="speed-trails" aria-hidden="true" />
          <div className="actor hero-actor">
            <AssetImage
              src={VISUAL.hero}
              className="hero-art"
              fallback="◇"
              width={256}
              height={256}
              testId="hero-image"
            />
            <span>HERO</span>
            <small>Damage {damage}</small>
          </div>
          <div className="versus" aria-hidden="true">
            ⚡
          </div>
          <div className={`actor ${boss ? "boss-actor" : "enemy-actor"}`}>
            <AssetImage
              src={boss ? zone.boss : zone.enemy}
              className={`enemy-art ${boss ? "boss-art" : ""}`}
              fallback={boss ? "⬟" : "◆"}
              width={boss ? 320 : 256}
              height={boss ? 320 : 256}
              testId="opponent-image"
            />
            <span>{boss ? "BOSS" : `ENEMY ${enemyIndex + 1}/4`}</span>
            <small>HP {hp}</small>
          </div>
        </div>
      )}
    </div>
  );
}
