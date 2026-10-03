import { PRESENTATION } from "../config/presentation";
import { advance, type GameEvent } from "../game/advance";
import { type Command, command } from "../game/commands";
import { decode, encode } from "../game/save";
import { type BurstResult, type GameState, initialState } from "../game/state";
import { load, persist, type StoragePort } from "./storage";
export interface RuntimeView {
  state: GameState;
  message: string;
  paused: boolean;
  fatal: boolean;
  rawSave: string | null;
  lastBurst: BurstResult | null;
}
export class GameRuntime {
  private view: RuntimeView;
  private listeners = new Set<() => void>();
  private last: number | null = null;
  private lastSave = 0;
  private hidden = false;
  constructor(
    private storage: StoragePort,
    private clock: () => number = () => performance.now(),
  ) {
    const result = load(storage);
    this.view = {
      state: result.state,
      message:
        result.error ??
        (result.recovered
          ? "backupからSaveを復旧しました"
          : "戦闘は自動。Goldで周回を圧縮しましょう。"),
      paused: !!result.error,
      fatal: !!result.error,
      rawSave: result.raw,
      lastBurst: null,
    };
  }
  getSnapshot = (): RuntimeView => this.view;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private publish(): void {
    for (const fn of this.listeners) fn();
  }
  private events(events: GameEvent[]): void {
    for (const event of events) {
      if (event.kind === "unlock")
        this.view = { ...this.view, message: `${event.label} 解禁！` };
      else this.view = { ...this.view, lastBurst: event.result };
    }
  }
  tick(): void {
    const now = this.clock();
    if (this.view.paused) {
      this.last = null;
      return;
    }
    if (this.last === null) {
      this.last = now;
      return;
    }
    const raw = Math.max(0, (now - this.last) / 1000);
    this.last = now;
    try {
      const result = advance(
        this.view.state,
        Math.min(raw, PRESENTATION.maxDeltaSeconds),
      );
      this.view = { ...this.view, state: result.state };
      if (raw > PRESENTATION.maxDeltaSeconds)
        this.view.message = "中断中は進行しません";
      this.events(result.events);
      if (
        this.view.state.stats.activeSeconds - this.lastSave >=
        PRESENTATION.saveSeconds
      )
        this.save();
    } catch (error) {
      this.view = {
        ...this.view,
        fatal: true,
        paused: true,
        message: String(error),
      };
    }
    this.publish();
  }
  visibility(hidden: boolean): void {
    if (hidden) {
      this.tick();
      this.save();
    }
    this.hidden = hidden;
    this.last = null;
    this.view = { ...this.view, paused: hidden || this.view.fatal };
    this.publish();
  }
  dispatch(cmd: Command): void {
    if (this.view.fatal) return;
    this.tick();
    if (this.view.fatal) return;
    try {
      const result = command(this.view.state, cmd);
      this.view = {
        ...this.view,
        state: result.state,
        message:
          cmd.type === "buy"
            ? "強化で周回を圧縮しました"
            : cmd.type === "prestige"
              ? "新しいCycleを開始しました"
              : "設定を更新しました",
      };
      this.events(result.events);
      this.save();
    } catch (error) {
      this.view = { ...this.view, message: String(error) };
    }
    this.publish();
  }
  save(): void {
    if (this.view.fatal) return;
    try {
      persist(this.storage, this.view.state);
      this.lastSave = this.view.state.stats.activeSeconds;
    } catch {
      this.view = {
        ...this.view,
        message: "保存失敗。設定からSaveをExportしてください。",
      };
    }
  }
  exportSave(): string {
    this.tick();
    return this.view.rawSave ?? encode(this.view.state);
  }
  previewImport(text: string): GameState {
    return decode(text);
  }
  importSave(text: string): void {
    const state = decode(text);
    persist(this.storage, state);
    this.last = null;
    this.lastSave = state.stats.activeSeconds;
    this.view = {
      state,
      message: "SaveをImportしました",
      paused: this.hidden,
      fatal: false,
      rawSave: null,
      lastBurst: null,
    };
    this.publish();
  }
  newGame(): void {
    const state = initialState();
    persist(this.storage, state);
    this.last = null;
    this.lastSave = 0;
    this.view = {
      state,
      message: "新規開始しました",
      paused: this.hidden,
      fatal: false,
      rawSave: null,
      lastBurst: null,
    };
    this.publish();
  }
}
