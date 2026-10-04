import { type Big, format } from "../game/number";

// Display only; never convert tiny internal values to a rounded game duration.
export function formatTime(seconds: Big): string {
  for (const [scale, unit] of [
    [1, "s"],
    [1e3, "ms"],
    [1e6, "μs"],
    [1e9, "ns"],
    [1e12, "ps"],
  ] as const) {
    const value = seconds.mul(scale);
    if (value.gte(1)) {
      const number = value.toNumber();
      if (number < 1000)
        return `${number.toFixed(number < 10 ? 2 : number < 100 ? 1 : 0)} ${unit}`;
      return `${format(value)} ${unit}`;
    }
  }
  return `${format(seconds)} s`;
}
