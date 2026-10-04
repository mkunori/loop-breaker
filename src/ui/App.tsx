import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BALANCE,
  PERMANENT_IDS,
  UPGRADE_IDS,
  type UpgradeId,
} from "../config/balance";
import { combatLod } from "../config/combatVisual";
import { PRESENTATION } from "../config/presentation";
import { VISUAL } from "../config/visual";
import {
  boundary,
  bulkPrice,
  canDeepen,
  canPrestige,
  cap,
  clearTime,
  damage,
  dps,
  fixedDelay,
  goldPerClear,
  hp,
  mastery,
  maxBuy,
  price,
  requiredStage,
  soulPrice,
  soulReward,
  stageAt,
  unlocked,
} from "../game/math";
import { D, format, scientific } from "../game/number";
import { cloneState, type GameState } from "../game/state";
import type { GameRuntime } from "../platform/runtime";
import { AssetImage } from "./AssetImage";
import { BattleVisual } from "./BattleVisual";
import { formatTime } from "./formatTime";
import { MasteryCelebration } from "./MasteryCelebration";

type Sheet = "upgrades" | "prestige" | "stats" | "settings" | null;
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
const effects: Record<UpgradeId, string> = {
  atk: `Damage ×${BALANCE.damage.growth} / ATK待ち係数 ×${BALANCE.delay.atk}`,
  speed: `攻撃頻度 ×${BALANCE.speedGrowth}`,
  crit: `Crit率 +${BALANCE.critChance * 100}% / ${BALANCE.critMultiplier}倍ダメージ`,
  overkill: `再利用倍率 +${BALANCE.overkill}`,
  delay: `Route待ち係数 ×${BALANCE.delay.compression}（ATKと合算）`,
};
let audio: AudioContext | undefined;
function beep(): void {
  if (!("AudioContext" in window)) return;
  audio ??= new AudioContext();
  void audio.resume();
  const oscillator = audio.createOscillator(),
    gain = audio.createGain();
  oscillator.frequency.value = 600;
  gain.gain.setValueAtTime(0.04, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.08);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.08);
}
export function App({ runtime }: { runtime: GameRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    s = view.state;
  const [sheet, setSheet] = useState<Sheet>(null),
    [maxMode, setMaxMode] = useState(false);
  const [reserve, setReserve] = useState(scientific(s.automation.reserveGold)),
    [confirmPrestige, setConfirmPrestige] = useState<number | null>(null);
  const [importText, setImportText] = useState(""),
    [preview, setPreview] = useState<GameState | null>(null),
    [error, setError] = useState(""),
    [confirmNew, setConfirmNew] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLElement | null>(null);
  useEffect(
    () => setReserve(scientific(s.automation.reserveGold)),
    [s.automation.reserveGold],
  );
  useEffect(() => {
    const visibility = () => runtime.visibility(document.hidden);
    visibility();
    const timer = window.setInterval(
      () => runtime.tick(),
      PRESENTATION.updateMs,
    );
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      runtime.save();
    };
  }, [runtime]);
  useEffect(() => {
    if (sheet) {
      dialog.current?.showModal();
      if (dialog.current) dialog.current.scrollTop = 0;
    } else {
      dialog.current?.close();
      opener.current?.focus();
    }
  }, [sheet]);
  const open = (value: Sheet) => {
    opener.current = document.activeElement as HTMLElement;
    setConfirmPrestige(null);
    setSheet(value);
    setError("");
  };
  const buy = (id: UpgradeId) => {
    runtime.dispatch({ type: "buy", id, max: maxMode });
    if (s.settings.sound) beep();
  };
  const stage = stageAt(s),
    time = clearTime(s),
    burst = s.run.burst;
  const candidates = [...UPGRADE_IDS]
    .reverse()
    .filter(
      (id) =>
        id !== "atk" &&
        unlocked(s, id) &&
        s.run.upgrades[id] < cap(id, s.meta.prestigeCount),
    );
  const candidate =
    candidates.find((id) => s.run.gold.gte(price(id, s.run.upgrades[id]))) ??
    candidates[0];
  const nextUnlock = UPGRADE_IDS.find((id) => !unlocked(s, id));
  function upgrade(id: UpgradeId, quick = false) {
    const level = s.run.upgrades[id],
      upper = cap(id, s.meta.prestigeCount),
      isUnlocked = unlocked(s, id);
    const n = maxMode ? maxBuy(id, level, s.run.gold, upper) : 1;
    const cost = n > 0 ? bulkPrice(id, level, n) : price(id, level);
    const atCap = level >= upper;
    const projection = cloneState(s);
    projection.run.upgrades[id] = Math.min(upper, level + Math.max(1, n));
    return (
      <button
        type="button"
        className={`upgrade ${quick ? "quick-buy" : ""} ${id === "atk" ? "primary-upgrade" : ""}`}
        key={id}
        data-testid={`buy-${id}`}
        disabled={
          !isUnlocked || atCap || n === 0 || s.run.gold.lt(cost) || view.fatal
        }
        onClick={() => buy(id)}
      >
        <span className="upgrade-name">
          {quick
            ? {
                atk: "ATK",
                speed: "Speed",
                crit: "Crit",
                overkill: "Overkill",
                delay: "Route",
              }[id]
            : BALANCE.upgrades[id].label}{" "}
          <small>Lv {level}</small>
        </span>
        <span className="upgrade-cost">
          {!isUnlocked
            ? `${BALANCE.upgrades[id].unlock} CLEARで解禁`
            : atCap
              ? "上限到達"
              : `${maxMode ? `MAX ×${n} · ` : ""}${format(cost, true)} G`}
        </span>
        <span className="upgrade-effect">
          {quick
            ? id === "atk"
              ? ""
              : `${formatTime(time)} → `
            : `${effects[id]} · Cap ${upper}`}
          {isUnlocked && !atCap
            ? `${quick ? (id === "atk" ? "→ " : "") : " → "}${formatTime(clearTime(projection))}${quick ? "" : " / RUN"}`
            : ""}
        </span>
      </button>
    );
  }
  function updateAuto(enabled: boolean) {
    try {
      const amount = D(reserve.replaceAll(",", ""));
      runtime.dispatch({ type: "auto", enabled, reserve: amount });
      setError("");
    } catch {
      setError("予約Goldは0以上の数値です（例: 100、1e6）");
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([runtime.exportSave()], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "loop-breaker-save.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  const windowProgress = burst.active
    ? burst.seconds / BALANCE.burst.window
    : s.run.phase;
  const enemyIndex = Math.min(4, Math.floor(s.run.phase * 6));
  const masteryIndex = Math.min(2, s.meta.prestigeCount);
  return (
    <main className="app" data-reduced-motion={s.settings.reducedMotion}>
      <header className="topbar">
        <div>
          <span className="eyebrow">INCREMENTAL RPG</span>
          <h1 aria-label="LOOPBREAKER">
            <AssetImage
              src={VISUAL.logo}
              className="brand-logo"
              fallback="LOOP BREAKER"
              width={720}
              height={180}
              testId="logo-image"
            />
            <span className="visually-hidden">LOOP BREAKER</span>
          </h1>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => open("settings")}
          aria-label="設定・Save"
        >
          ☷
        </button>
      </header>
      <section className="hud" aria-label="進行状況">
        <div>
          <span className="eyebrow">STAGE / TARGET {s.run.targetStage}</span>
          <strong data-testid="stage">{stage}</strong>
        </div>
        <div className="gold">
          <span className="eyebrow">GOLD</span>
          <strong data-testid="gold">{format(s.run.gold)}</strong>
          <small>+{format(goldPerClear(s))} / CLEAR</small>
        </div>
      </section>
      <section
        className={`arena ${burst.active ? "burst-arena" : ""}`}
        aria-label="自動戦闘"
      >
        <div className="arena-heading">
          <span>{burst.active ? "BURST MODE" : "AUTO BATTLE"}</span>
          <span>CYCLE {s.meta.prestigeCount + 1}</span>
        </div>
        <BattleVisual
          lod={combatLod(time, burst.active)}
          stage={stage}
          enemyIndex={enemyIndex}
          damage={format(damage(s))}
          hp={format(hp(stage).mul(enemyIndex === 4 ? 0.5 : 0.125))}
          burst={burst.active}
          clears={format(burst.clears)}
          gold={format(burst.gold)}
        />
        <div className="progress-label">
          <span>
            {burst.active
              ? `BURST ${burst.seconds.toFixed(2)} / 5.00 sec`
              : "RUN PROGRESS"}
          </span>
          <span>{Math.floor(windowProgress * 100)}%</span>
        </div>
        <progress
          max={1}
          value={windowProgress}
          aria-label={burst.active ? "BURST進捗" : "RUN進捗"}
        />
        <div className="arena-metrics">
          <div>
            <span>DPS</span>
            <strong>{format(dps(s))}</strong>
          </div>
          <div>
            <span>CLEAR TIME</span>
            <strong data-testid="clear-time">
              {formatTime(time)}
              <small> / RUN</small>
            </strong>
          </div>
        </div>
      </section>
      <div className="summary">
        <span>
          CLEAR{" "}
          <strong data-testid="clears">
            {s.run.approximateClears ? "約" : ""}
            {format(s.run.clears)}
          </strong>
        </span>
        <span>
          TIME <strong>{duration(s.run.activeSeconds)}</strong>
        </span>
      </div>
      {view.lastBurst && (
        <div className="burst-result">
          {view.lastBurst.partial ? "部分BURST" : "BURST 5.00 sec"} · CLEAR ×
          {format(view.lastBurst.clears)} · +{format(view.lastBurst.gold)} G
        </div>
      )}
      <p className={`notice ${view.fatal ? "error" : ""}`} role="status">
        {view.paused && !view.fatal ? "一時停止中 · " : ""}
        {view.message}
      </p>
      <nav className="secondary-actions" aria-label="補助画面">
        {s.stats.highestStage >= BALANCE.stage.firstTarget && (
          <button
            type="button"
            className={canPrestige(s) ? "prestige-ready" : ""}
            onClick={() => open("prestige")}
          >
            Prestige · {format(s.meta.soul)} SOUL
          </button>
        )}
        <button type="button" onClick={() => open("stats")}>
          Stats
        </button>
        {s.meta.prestigeCount >= 3 && (
          <div className="advance-controls">
            <button
              type="button"
              disabled={
                !canDeepen(s) ||
                s.automation.autoAdvanceEnabled ||
                s.run.targetStage + BALANCE.stage.deepen >
                  BALANCE.limits.stage ||
                view.fatal
              }
              onClick={() => runtime.dispatch({ type: "deepen" })}
            >
              さらに進む +{BALANCE.stage.deepen}
            </button>
            <label className="auto-advance">
              <input
                type="checkbox"
                aria-label="AUTO ADVANCE"
                disabled={view.fatal}
                checked={s.automation.autoAdvanceEnabled}
                onChange={(e) =>
                  runtime.dispatch({
                    type: "autoAdvance",
                    enabled: e.target.checked,
                  })
                }
              />
              AUTO ADVANCE {s.automation.autoAdvanceEnabled ? "ON" : "OFF"}
            </label>
          </div>
        )}
      </nav>
      <section className="control-panel" aria-label="主要強化">
        <div className="control-heading">
          <button type="button" onClick={() => open("upgrades")}>
            UPGRADES ↗
          </button>
          <div className="buy-mode">
            <button
              type="button"
              aria-pressed={!maxMode}
              onClick={() => setMaxMode(false)}
            >
              x1
            </button>
            <button
              type="button"
              aria-pressed={maxMode}
              onClick={() => setMaxMode(true)}
            >
              MAX
            </button>
          </div>
        </div>
        <div className="quick-upgrades">
          {upgrade("atk", true)}
          {candidate ? (
            upgrade(candidate, true)
          ) : nextUnlock ? (
            <div className="next-unlock">
              NEXT: {BALANCE.upgrades[nextUnlock].label}
              <small>{BALANCE.upgrades[nextUnlock].unlock} CLEARで解禁</small>
            </div>
          ) : (
            <div className="next-unlock">
              周回を圧縮しよう<small>新しい上限はPrestigeで解放</small>
            </div>
          )}
        </div>
        {s.meta.unlocks.autoAtk && (
          <div className="auto-row">
            <label>
              <input
                type="checkbox"
                aria-label="AUTO ATK購入"
                checked={s.automation.atkEnabled}
                onChange={(e) => updateAuto(e.target.checked)}
              />{" "}
              <span>AUTO ATK {s.automation.atkEnabled ? "ON" : "OFF"}</span>
            </label>
          </div>
        )}
      </section>
      <dialog
        ref={dialog}
        className="sheet"
        onCancel={() => setSheet(null)}
        aria-labelledby="sheet-title"
      >
        <div className="sheet-heading">
          <h2 id="sheet-title">
            {sheet === "upgrades"
              ? "UPGRADES"
              : sheet === "prestige"
                ? "PRESTIGE"
                : sheet === "stats"
                  ? "STATS"
                  : "SETTINGS / SAVE"}
          </h2>
          <button
            type="button"
            onClick={() => setSheet(null)}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="sheet-content">
          {sheet === "upgrades" && (
            <>
              <p>戦闘は最初から自動。購入で1周の時間を短くします。</p>
              <div className="all-upgrades">
                {UPGRADE_IDS.map((id) => upgrade(id))}
              </div>
              <p>
                ATKとRouteは待ち時間を共同で圧縮します。目標Stage攻略後も育成を続けられます。Prestigeするか、今のCycleでBURSTを目指すかを選べます。
              </p>
              <p>
                LOOP MASTERY ×{mastery(s.meta.prestigeCount).toPrecision(4)} ·
                固定待ち{" "}
                {formatTime(fixedDelay(s).mul(mastery(s.meta.prestigeCount)))}
              </p>
              {s.meta.unlocks.autoAtk && (
                <fieldset>
                  <legend>AUTO ATK（強化購入の自動化）</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={s.automation.atkEnabled}
                      onChange={(e) => updateAuto(e.target.checked)}
                    />{" "}
                    1秒ごとにATKをMAX購入
                  </label>
                  <label className="field">
                    残しておくGold
                    <input
                      aria-label="予約Gold"
                      value={reserve}
                      onChange={(e) => setReserve(e.target.value)}
                      inputMode="decimal"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => updateAuto(s.automation.atkEnabled)}
                  >
                    予約Goldを保存
                  </button>
                  <small>
                    他の強化用に残せます。設定はPrestige後も保持します。
                  </small>
                </fieldset>
              )}
            </>
          )}
          {sheet === "prestige" && (
            <>
              <MasteryCelebration
                count={s.meta.prestigeCount}
                message={view.message}
              />
              <div className="soul-banner">
                SOUL <strong>{format(s.meta.soul)}</strong>
                <small>
                  {canPrestige(s)
                    ? `今回 +${format(soulReward(s))} SOUL`
                    : `Stage ${requiredStage(s.meta.prestigeCount)} CLEARでPrestige可能`}
                </small>
              </div>
              <p>
                次Cycle目標: Stage {requiredStage(s.meta.prestigeCount + 1)}
              </p>
              {s.meta.prestigeCount >= 2 && !s.meta.unlocks.burst && (
                <p>
                  今のCycleでさらに圧縮するとBURSTを目指せます。Prestigeを続けてもLOOP
                  MASTERYの継続短縮が育ちます。
                </p>
              )}
              <h3>LOOP MASTERY</h3>
              <div className="milestones">
                <p>
                  BREAK I · 全周回時間 ×{BALANCE.mastery[1]} /{" "}
                  {Math.round((1 - BALANCE.mastery[1]) * 100)}%短縮{" "}
                  <b>{masteryIndex >= 1 ? "獲得済み" : "今回獲得"}</b>
                </p>
                <p>
                  BREAK II · 累積 ×{BALANCE.mastery[2]} /{" "}
                  {Math.round((1 - BALANCE.mastery[2]) * 100)}%短縮{" "}
                  <b>
                    {masteryIndex >= 2
                      ? "獲得済み"
                      : masteryIndex === 1
                        ? "今回獲得"
                        : "2回目で獲得"}
                  </b>
                </p>
                <p>
                  BREAK II以降 · 毎Prestigeで全周回時間 ×
                  {BALANCE.masteryContinuation.factor} /{" "}
                  {Math.round((1 - BALANCE.masteryContinuation.factor) * 100)}
                  %短縮
                  <br />
                  現在の累積倍率 ×{mastery(s.meta.prestigeCount).toPrecision(4)}
                  <br />
                  次Prestigeの累積倍率 ×
                  {mastery(s.meta.prestigeCount + 1).toPrecision(4)}
                </p>
              </div>
              <h3>次回の通常強化上限</h3>
              <p>
                {UPGRADE_IDS.filter((id) => id !== "atk")
                  .map(
                    (id) =>
                      `${BALANCE.upgrades[id].label} ${cap(id, s.meta.prestigeCount)}→${cap(id, s.meta.prestigeCount + 1)}`,
                  )
                  .join(" / ")}
              </p>
              <p>
                Reset: Gold・通常Lv・Stage・RUN進捗・Cycle時間
                <br />
                保持: SOUL・恒久Lv・解禁・AUTO・累積統計
              </p>
              <p>
                直後の予測: {(() => {
                  const next = cloneState(s);
                  next.meta.prestigeCount++;
                  next.run.upgrades = {
                    atk: 0,
                    speed: 0,
                    crit: 0,
                    overkill: 0,
                    delay: 0,
                  };
                  return formatTime(clearTime(next, 1));
                })()} / RUN（SOUL未購入）
              </p>
              <button
                type="button"
                className="accent-button"
                disabled={!canPrestige(s) || view.fatal}
                onClick={() => {
                  if (confirmPrestige === null)
                    setConfirmPrestige(s.meta.prestigeCount);
                  else {
                    runtime.dispatch({
                      type: "prestige",
                      expectedCount: confirmPrestige,
                    });
                    setConfirmPrestige(null);
                  }
                }}
              >
                {confirmPrestige === null
                  ? "Prestigeする"
                  : "ResetしてPrestigeを確定"}
              </button>
              <h3>永久強化</h3>
              {PERMANENT_IDS.map((id) => (
                <button
                  type="button"
                  className="upgrade"
                  key={id}
                  disabled={
                    s.meta.soul.lt(soulPrice(id, s.meta.upgrades[id])) ||
                    view.fatal
                  }
                  onClick={() => runtime.dispatch({ type: "permanent", id })}
                >
                  <span>
                    {BALANCE.permanent[id].label} Lv{s.meta.upgrades[id]}
                  </span>
                  <span>{format(soulPrice(id, s.meta.upgrades[id]))} SOUL</span>
                  <small>
                    {id === "power"
                      ? `Damage ×${(1 + BALANCE.damage.power * s.meta.upgrades[id]).toFixed(2)}`
                      : id === "wealth"
                        ? `Gold ×${(1 + BALANCE.gold.wealth * s.meta.upgrades[id]).toFixed(2)}`
                        : `固定待ち ×${BALANCE.delay.tempo ** s.meta.upgrades[id]}`}
                  </small>
                </button>
              ))}
            </>
          )}
          {sheet === "stats" && (
            <dl className="stats-list">
              <dt>Total Clears</dt>
              <dd>
                {s.stats.approximateClears ? "約" : ""}
                {format(s.stats.totalClears)}
              </dd>
              <dt>Fastest Clear（理論）</dt>
              <dd>
                {s.stats.fastestClear
                  ? `${formatTime(s.stats.fastestClear)} / Stage ${s.stats.fastestClearStage}`
                  : "—"}
              </dd>
              <dt>Highest Stage（CLEAR済み）</dt>
              <dd>{s.stats.highestStage}</dd>
              <dt>Total Gold Earned</dt>
              <dd>{format(s.stats.totalGoldEarned)}</dd>
              <dt>Prestige Count</dt>
              <dd>{s.meta.prestigeCount}</dd>
              <dt>Best BURST / 5秒</dt>
              <dd>{format(s.stats.bestBurstClears)}</dd>
              <dt>Total Play Time</dt>
              <dd>{duration(s.stats.activeSeconds)}</dd>
              <dt>LOOP MASTERY</dt>
              <dd>×{mastery(s.meta.prestigeCount).toPrecision(4)}</dd>
              <dt>経路進捗</dt>
              <dd>
                {s.run.routeClears} / {boundary(s.run.targetStage) + 1}
              </dd>
            </dl>
          )}
          {sheet === "settings" && (
            <>
              <p>
                表示中だけ進行します。背景・終了中の報酬はありません。複数タブで同時にプレイしないでください。
              </p>
              <label className="setting">
                <input
                  type="checkbox"
                  checked={s.settings.reducedMotion}
                  onChange={(e) =>
                    runtime.dispatch({
                      type: "settings",
                      reducedMotion: e.target.checked,
                      sound: s.settings.sound,
                    })
                  }
                />{" "}
                アニメーションを減らす
              </label>
              <label className="setting">
                <input
                  type="checkbox"
                  checked={s.settings.sound}
                  onChange={(e) =>
                    runtime.dispatch({
                      type: "settings",
                      sound: e.target.checked,
                      reducedMotion: s.settings.reducedMotion,
                    })
                  }
                />{" "}
                購入効果音
              </label>
              <button type="button" onClick={download}>
                SaveをExport{view.rawSave ? "（元データ）" : ""}
              </button>
              <label className="field">
                Saveファイルを選択
                <input
                  type="file"
                  accept=".json,application/json"
                  aria-label="Saveファイル"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      if (file.size > PRESENTATION.importBytes)
                        throw new Error("32KB以内のSaveを選択してください");
                      const text = await file.text();
                      setImportText(text);
                      setPreview(runtime.previewImport(text));
                      setError("");
                    } catch (err) {
                      setPreview(null);
                      setError(String(err));
                    }
                  }}
                />
              </label>
              <label className="field">
                またはSave JSONを貼り付け
                <textarea
                  aria-label="Save JSON"
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    setPreview(null);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  try {
                    setPreview(runtime.previewImport(importText));
                    setError("");
                  } catch (err) {
                    setError(String(err));
                  }
                }}
              >
                Importを確認
              </button>
              {preview && (
                <div className="import-preview">
                  <p>
                    Stage {stageAt(preview)} / Gold {format(preview.run.gold)} /
                    Prestige {preview.meta.prestigeCount}
                    <br />
                    現在のSaveを置換し、正常データをbackupへ残します。
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        runtime.importSave(importText);
                        setPreview(null);
                        setSheet(null);
                      } catch (err) {
                        setError(String(err));
                      }
                    }}
                  >
                    このSaveをImport
                  </button>
                </div>
              )}
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (!confirmNew) setConfirmNew(true);
                  else {
                    try {
                      runtime.newGame();
                      setConfirmNew(false);
                      setSheet(null);
                    } catch (err) {
                      setError(String(err));
                    }
                  }
                }}
              >
                {confirmNew ? "現在の進行をResetして新規開始" : "新規開始"}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </div>
      </dialog>
    </main>
  );
}
