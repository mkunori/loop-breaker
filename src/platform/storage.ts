import { decode, encode } from "../game/save";
import { type GameState, initialState } from "../game/state";
export const SAVE_KEYS = {
  current: "loop-breaker.current",
  backup: "loop-breaker.backup",
} as const;
export interface StoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface LoadResult {
  state: GameState;
  recovered: boolean;
  error: string | null;
  raw: string | null;
}
export function load(storage: StoragePort): LoadResult {
  let current: string | null = null,
    backup: string | null = null;
  try {
    current = storage.getItem(SAVE_KEYS.current);
    backup = storage.getItem(SAVE_KEYS.backup);
  } catch {
    return {
      state: initialState(),
      recovered: false,
      error:
        "Saveを読み取れません。元データを確認してから新規開始してください。",
      raw: null,
    };
  }
  if (current === null && backup === null)
    return { state: initialState(), recovered: false, error: null, raw: null };
  for (const [raw, recovered] of [
    [current, false],
    [backup, true],
  ] as const) {
    if (raw === null) continue;
    try {
      return { state: decode(raw), recovered, error: null, raw: null };
    } catch {
      /* Try backup without overwriting the corrupt data. */
    }
  }
  return {
    state: initialState(),
    recovered: false,
    error:
      "Saveを復旧できません。元データをExportするか、Import / 新規開始を選んでください。",
    raw: current ?? backup,
  };
}
export function persist(storage: StoragePort, s: GameState): void {
  const text = encode(s),
    current = storage.getItem(SAVE_KEYS.current);
  if (current !== null) {
    let valid = false;
    try {
      decode(current);
      valid = true;
    } catch {
      /* Keep the previous valid backup. */
    }
    if (valid) storage.setItem(SAVE_KEYS.backup, current);
  }
  storage.setItem(SAVE_KEYS.current, text);
}
