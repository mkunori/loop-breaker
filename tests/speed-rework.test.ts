import { describe, expect, it } from "vitest";
import { combatLod } from "../src/config/combatVisual";
import { advance } from "../src/game/advance";
import { clearTime } from "../src/game/math";
import { D } from "../src/game/number";
import { initialState } from "../src/game/state";
import { formatTime } from "../src/ui/formatTime";

describe("speed presentation", () => {
  it.each([
    [5, "5.00 s"],
    [1.24, "1.24 s"],
    [0.842, "842 ms"],
    [0.0917, "91.7 ms"],
    [0.00842, "8.42 ms"],
    [0.000713, "713 μs"],
    [1e-6, "1.00 μs"],
    [1e-9, "1.00 ns"],
    [1e-12, "1.00 ps"],
  ])("formats %s without changing internal precision", (value, expected) => {
    const time = D(value);
    const before = time.toString();
    expect(formatTime(time)).toBe(expected);
    expect(time.toString()).toBe(before);
  });
  it("keeps extreme values and near-boundary values readable", () => {
    expect(formatTime(D("1e-100"))).toContain("e-100 s");
    expect(formatTime(D(0.999999))).toBe("1000 ms");
  });
  it("selects independent, bounded visual LOD", () => {
    expect(combatLod(D(5), false)).toBe("normal");
    expect(combatLod(D(1), false)).toBe("normal");
    expect(combatLod(D(0.999), false)).toBe("fast");
    expect(combatLod(D(0.1), false)).toBe("fast");
    expect(combatLod(D(0.099), false)).toBe("ultra");
    expect(combatLod(D("1e-20"), true)).toBe("burst");
  });
});
describe("current balance timing", () => {
  it("starts at exactly 5 seconds and enters BURST below 1ms", () => {
    expect(clearTime(initialState()).toNumber()).toBe(5);
    const s = initialState();
    s.meta.prestigeCount = 20;
    s.meta.upgrades.tempo = 30;
    s.run.upgrades.delay = 30;
    s.run.upgrades.atk = 200;
    expect(advance(s, 5).state.run.burst.active).toBe(true);
  });
});
