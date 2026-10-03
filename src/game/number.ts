import Decimal from "break_infinity.js";
import { BALANCE } from "../config/balance";
export type Big = Decimal;
export const D = (value: Decimal | number | string = 0): Big =>
  new Decimal(value);
export function validBig(value: Big): boolean {
  return (
    Number.isFinite(value.mantissa) &&
    Number.isFinite(value.exponent) &&
    Math.abs(value.exponent) <= BALANCE.limits.exponent &&
    value.gte(0)
  );
}
export function scientific(value: Big): string {
  return value.eq(0) ? "0" : `${value.mantissa}e${value.exponent}`;
}
export function format(value: Big | number, price = false): string {
  const n = D(value);
  if (!validBig(n)) return "—";
  if (n.eq(0)) return "0";
  if (n.lt(0.01) || n.gte(1e12)) return n.toExponential(2);
  if (n.lt(1000)) {
    const x = n.toNumber();
    return (price ? Math.ceil(x * 100) / 100 : x).toLocaleString("en-US", {
      maximumFractionDigits: 2,
    });
  }
  const groups = ["", "K", "M", "B"];
  const group = Math.min(3, Math.floor(n.log10() / 3));
  return `${n
    .div(D(10).pow(group * 3))
    .toNumber()
    .toFixed(2)}${groups[group]}`;
}
export function splitWork(work: Big): {
  count: Big;
  phase: number;
  approximate: boolean;
} {
  if (work.gt(BALANCE.limits.exactCount))
    return { count: work.floor(), phase: 0, approximate: true };
  const x = work.toNumber();
  const nearest = Math.round(x);
  const snapped =
    Math.abs(x - nearest) <= 4 * Number.EPSILON * Math.max(1, x) ? nearest : x;
  const count = Math.floor(snapped);
  return {
    count: D(count),
    phase: Math.max(0, Math.min(1 - Number.EPSILON, snapped - count)),
    approximate: false,
  };
}
