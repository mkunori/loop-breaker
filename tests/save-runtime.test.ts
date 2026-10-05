import { describe, expect, it } from "vitest";
import { advance } from "../src/game/advance";
import { D } from "../src/game/number";
import {
  decode,
  encode,
  migrate,
  UNSUPPORTED_BALANCE_MESSAGE,
} from "../src/game/save";
import { initialState } from "../src/game/state";
import { GameRuntime } from "../src/platform/runtime";
import {
  load,
  persist,
  SAVE_KEYS,
  type StoragePort,
} from "../src/platform/storage";
import { fixture } from "./fixtures";

class MemoryStorage implements StoragePort {
  entries = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error("QuotaExceeded");
    this.entries.set(key, value);
  }
}
describe("Save validation and compact serialization", () => {
  it.each(["prototype-2", "speed-3", "speed-4", "unknown-development"])(
    "rejects unsupported balance %s without migration",
    (version) => {
      const raw = JSON.parse(fixture());
      raw.balanceVersion = version;
      expect(() => decode(JSON.stringify(raw))).toThrow(
        UNSUPPORTED_BALANCE_MESSAGE,
      );
    },
  );
  it("roundtrips phase, partial BURST, huge Gold, permanent data and settings", () => {
    const s = decode(fixture("burst"));
    s.run.gold = D("1e42");
    s.run.autoClock = 0.25;
    s.settings.reducedMotion = true;
    const encoded = encode(s),
      restored = decode(encoded);
    expect(restored.run.gold.eq("1e42")).toBe(true);
    expect(restored.run.phase).toBe(0.25);
    expect(restored.run.burst.seconds).toBe(2);
    expect(restored.run.burst.clears.eq(3)).toBe(true);
    expect(restored.run.autoClock).toBe(0.25);
    expect(restored.settings.reducedMotion).toBe(true);
    expect(new TextEncoder().encode(encoded).length).toBeLessThan(2048);
    console.log(
      "Save payload bytes:",
      new TextEncoder().encode(encoded).length,
    );
  });
  it("size remains bounded after ten thousand cycles", () => {
    const s = initialState();
    s.meta.prestigeCount = 10000;
    s.run.targetStage = 100 + 50 * 9998;
    s.meta.soul = D("1e100");
    s.stats.totalClears = D("1e42");
    s.stats.totalGoldEarned = D("1e50");
    s.stats.approximateClears = true;
    const text = encode(s);
    expect(new TextEncoder().encode(text).length).toBeLessThan(2048);
  });
  it.each(["NaN", "Infinity", "-1", "1e1000000001"])(
    "rejects unsafe currency %s",
    (value) => {
      const raw = JSON.parse(fixture());
      raw.run.gold = value;
      expect(() => decode(JSON.stringify(raw))).toThrow();
    },
  );
  it("rejects invalid timers, levels, routes, versions, oversized and malformed payloads", () => {
    for (const mutate of [
      (o: ReturnType<typeof JSON.parse>) => {
        o.run.phase = 1;
      },
      (o: ReturnType<typeof JSON.parse>) => {
        o.run.autoClock = 1;
      },
      (o: ReturnType<typeof JSON.parse>) => {
        o.run.upgrades.crit = 9;
      },
      (o: ReturnType<typeof JSON.parse>) => {
        o.run.routeClears = 500;
      },
      (o: ReturnType<typeof JSON.parse>) => {
        o.saveVersion = 99;
      },
      (o: ReturnType<typeof JSON.parse>) => {
        delete o.meta;
      },
    ]) {
      const raw = JSON.parse(fixture());
      mutate(raw);
      expect(() => decode(JSON.stringify(raw))).toThrow();
    }
    expect(() => decode("{")).toThrow();
    expect(() => decode("x".repeat(32769))).toThrow();
    expect(() =>
      encode({
        ...initialState(),
        run: { ...initialState().run, gold: D(NaN) },
      }),
    ).toThrow();
  });
  it("repairs display-only stage and exposes a pure migration registry", () => {
    const raw = JSON.parse(fixture());
    raw.run.stage = 999;
    expect(decode(JSON.stringify(raw)).run.routeClears).toBe(0);
    expect(
      migrate(
        { saveVersion: 0, data: 4 },
        { 0: (o) => ({ ...o, saveVersion: 1 }) },
      ).data,
    ).toBe(4);
    expect(() => migrate({ saveVersion: 0 })).toThrow();
  });
});
describe("storage and runtime", () => {
  it.each(["speed-3", "speed-4"])(
    "preserves %s Save until explicit new game and rejects its Import",
    (version) => {
      const storage = new MemoryStorage();
      const raw = JSON.parse(fixture());
      raw.balanceVersion = version;
      const text = JSON.stringify(raw);
      storage.setItem(SAVE_KEYS.current, text);
      const runtime = new GameRuntime(storage);
      expect(runtime.getSnapshot().fatal).toBe(true);
      expect(runtime.getSnapshot().message).toBe(UNSUPPORTED_BALANCE_MESSAGE);
      runtime.tick();
      runtime.save();
      expect(storage.getItem(SAVE_KEYS.current)).toBe(text);
      expect(runtime.exportSave()).toBe(text);
      expect(() => runtime.importSave(text)).toThrow(
        UNSUPPORTED_BALANCE_MESSAGE,
      );
      runtime.newGame();
      expect(runtime.getSnapshot().fatal).toBe(false);
      expect(
        decode(storage.getItem(SAVE_KEYS.current) ?? "").run.clears.eq(0),
      ).toBe(true);
    },
  );
  it("recovers current balance backup when current has an unsupported balance", () => {
    const storage = new MemoryStorage();
    const raw = JSON.parse(fixture());
    raw.balanceVersion = "development-old";
    storage.setItem(SAVE_KEYS.current, JSON.stringify(raw));
    storage.setItem(SAVE_KEYS.backup, fixture());
    expect(load(storage).recovered).toBe(true);
    expect(load(storage).error).toBeNull();
  });
  it("creates a current + previous valid backup and recovers corrupted current", () => {
    const storage = new MemoryStorage();
    persist(storage, initialState());
    const second = initialState();
    second.run.gold = D(100);
    persist(storage, second);
    expect(decode(storage.getItem(SAVE_KEYS.backup) ?? "").run.gold.eq(0)).toBe(
      true,
    );
    storage.setItem(SAVE_KEYS.current, "{bad");
    const result = load(storage);
    expect(result.recovered).toBe(true);
    expect(result.state.run.gold.eq(0)).toBe(true);
    persist(storage, result.state);
    expect(load(storage).error).toBeNull();
  });
  it("does not overwrite both damaged Saves and keeps raw export available", () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEYS.current, "{bad");
    storage.setItem(SAVE_KEYS.backup, "{also bad");
    let now = 0;
    const runtime = new GameRuntime(storage, () => now);
    now = 5000;
    runtime.tick();
    runtime.save();
    expect(runtime.getSnapshot().fatal).toBe(true);
    expect(runtime.exportSave()).toBe("{bad");
    expect(storage.getItem(SAVE_KEYS.current)).toBe("{bad");
  });
  it("freezes hidden time, resumes without catch-up and caps long interruptions", () => {
    const storage = new MemoryStorage();
    let now = 0;
    const runtime = new GameRuntime(storage, () => now);
    runtime.tick();
    now = 2000;
    runtime.tick();
    expect(runtime.getSnapshot().state.run.activeSeconds).toBe(2);
    runtime.visibility(true);
    now = 200000;
    runtime.tick();
    expect(runtime.getSnapshot().state.run.activeSeconds).toBe(2);
    runtime.visibility(false);
    runtime.tick();
    now += 1000;
    runtime.tick();
    expect(runtime.getSnapshot().state.run.activeSeconds).toBe(3);
    now += 60000;
    runtime.tick();
    expect(runtime.getSnapshot().state.run.activeSeconds).toBe(8);
    const reopened = new GameRuntime(storage, () => now + 999999);
    reopened.tick();
    expect(reopened.getSnapshot().state.run.activeSeconds).toBe(8);
  });
  it("continues on storage write failure and reports export recovery", () => {
    const storage = new MemoryStorage();
    const runtime = new GameRuntime(storage);
    storage.fail = true;
    runtime.save();
    expect(runtime.getSnapshot().fatal).toBe(false);
    expect(runtime.getSnapshot().message).toContain("保存失敗");
    expect(() => decode(runtime.exportSave())).not.toThrow();
  });
  it("validates import before replacing, backs up, and preserves partial progress", () => {
    const storage = new MemoryStorage();
    persist(storage, initialState());
    const runtime = new GameRuntime(storage);
    expect(() => runtime.importSave("{bad")).toThrow();
    expect(
      decode(storage.getItem(SAVE_KEYS.current) ?? "").run.gold.eq(0),
    ).toBe(true);
    runtime.importSave(fixture("burst"));
    expect(runtime.getSnapshot().state.run.burst.seconds).toBe(2);
    expect(decode(storage.getItem(SAVE_KEYS.backup) ?? "").run.gold.eq(0)).toBe(
      true,
    );
  });
  it("serializes live advancing state with no enemy/history arrays", () => {
    let s = initialState();
    for (let n = 0; n < 50; n++) {
      s = advance(s, 0.1).state;
      expect(() => decode(encode(s))).not.toThrow();
    }
    expect(encode(s)).not.toContain("history");
  });
  it("Import and new game remain paused while the document is hidden", () => {
    const runtime = new GameRuntime(new MemoryStorage());
    runtime.visibility(true);
    runtime.importSave(fixture());
    expect(runtime.getSnapshot().paused).toBe(true);
    runtime.newGame();
    expect(runtime.getSnapshot().paused).toBe(true);
  });
});
