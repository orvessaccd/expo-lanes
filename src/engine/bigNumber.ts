/**
 * BigFloat — Pure scientific notation arithmetic engine ({ sign, m, e })
 * Breaks through IEEE-754 Number.MAX_VALUE (~1.79e308) up to 10^10,000,000
 * without ever producing NaN or Infinity.
 */

export type NumberFormatStyle = "intl" | "zh" | "sci";

export interface BigFloat {
  /** -1, 0, or 1 */
  sign: -1 | 0 | 1;
  /** Mantissa in [1, 10), or 0 when sign === 0 */
  m: number;
  /** Base-10 integer exponent */
  e: number;
}

export const MAX_BF_EXPONENT = 10_000_000;
export const MIN_BF_EXPONENT = -10_000_000;

export const BF_ZERO: BigFloat = Object.freeze({ sign: 0, m: 0, e: 0 });
export const BF_ONE: BigFloat = Object.freeze({ sign: 1, m: 1, e: 0 });

export function bfNormalize(sign: number, m: number, e: number): BigFloat {
  if (sign === 0 || m === 0 || !Number.isFinite(m) || !Number.isFinite(e)) {
    if (!Number.isFinite(m) || !Number.isFinite(e)) {
      if (m === Infinity || e === Infinity) {
        return {
          sign: sign < 0 ? -1 : 1,
          m: 9.999999999,
          e: MAX_BF_EXPONENT,
        };
      }
      return BF_ZERO;
    }
    return BF_ZERO;
  }

  let s: -1 | 1 = sign < 0 ? -1 : 1;
  let mant = m;
  if (mant < 0) {
    s = (s === 1 ? -1 : 1) as -1 | 1;
    mant = -mant;
  }

  let exp = e;
  // Handle non-integer exponent if passed accidentally
  if (!Number.isInteger(exp)) {
    const frac = exp - Math.floor(exp);
    exp = Math.floor(exp);
    mant *= Math.pow(10, frac);
  }

  if (mant >= 10 || mant < 1) {
    const shift = Math.floor(Math.log10(mant));
    mant = mant / Math.pow(10, shift);
    exp += shift;
    // Guard floating rounding boundary like 9.999999999999999 -> 10
    if (mant >= 10) {
      mant /= 10;
      exp += 1;
    } else if (mant < 1 && mant > 0) {
      mant *= 10;
      exp -= 1;
    }
  }

  if (exp > MAX_BF_EXPONENT) {
    return { sign: s, m: 9.999999999, e: MAX_BF_EXPONENT };
  }
  if (exp < MIN_BF_EXPONENT) {
    return BF_ZERO;
  }

  return { sign: s, m: mant, e: exp };
}

export function bf(input: number | string | BigFloat): BigFloat {
  if (typeof input === "object" && input !== null && "m" in input && "e" in input) {
    return bfNormalize(input.sign, input.m, input.e);
  }
  if (typeof input === "number") {
    if (input === 0 || Number.isNaN(input)) return BF_ZERO;
    if (!Number.isFinite(input)) {
      return {
        sign: input < 0 ? -1 : 1,
        m: 9.999999999,
        e: MAX_BF_EXPONENT,
      };
    }
    return bfNormalize(input < 0 ? -1 : 1, Math.abs(input), 0);
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed === "0") return BF_ZERO;
  const sciMatch = /^([+-]?\d*\.?\d+)(?:[eE]([+-]?\d+))?$/.exec(trimmed);
  if (!sciMatch) {
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? BF_ZERO : bf(parsed);
  }
  const mantRaw = Number(sciMatch[1]);
  const expRaw = sciMatch[2] ? Number(sciMatch[2]) : 0;
  if (mantRaw === 0) return BF_ZERO;
  return bfNormalize(mantRaw < 0 ? -1 : 1, Math.abs(mantRaw), expRaw);
}

export function bfClone(a: BigFloat): BigFloat {
  return { sign: a.sign, m: a.m, e: a.e };
}

export function bfNeg(a: BigFloat): BigFloat {
  if (a.sign === 0) return BF_ZERO;
  return { sign: (a.sign === 1 ? -1 : 1) as -1 | 1, m: a.m, e: a.e };
}

export function bfAbs(a: BigFloat): BigFloat {
  if (a.sign === 0) return BF_ZERO;
  return { sign: 1, m: a.m, e: a.e };
}

export function bfCmp(a: BigFloat, b: BigFloat): -1 | 0 | 1 {
  if (a.sign !== b.sign) {
    return a.sign < b.sign ? -1 : 1;
  }
  if (a.sign === 0) return 0;
  if (a.e !== b.e) {
    if (a.sign === 1) return a.e < b.e ? -1 : 1;
    return a.e < b.e ? 1 : -1;
  }
  if (Math.abs(a.m - b.m) < 1e-12) return 0;
  if (a.sign === 1) return a.m < b.m ? -1 : 1;
  return a.m < b.m ? 1 : -1;
}

export function bfGt(a: BigFloat, b: BigFloat): boolean {
  return bfCmp(a, b) === 1;
}

export function bfGte(a: BigFloat, b: BigFloat): boolean {
  return bfCmp(a, b) >= 0;
}

export function bfLt(a: BigFloat, b: BigFloat): boolean {
  return bfCmp(a, b) === -1;
}

export function bfLte(a: BigFloat, b: BigFloat): boolean {
  return bfCmp(a, b) <= 0;
}

export function bfMax(a: BigFloat, b: BigFloat): BigFloat {
  return bfCmp(a, b) >= 0 ? a : b;
}

export function bfMin(a: BigFloat, b: BigFloat): BigFloat {
  return bfCmp(a, b) <= 0 ? a : b;
}

export function bfIsZero(a: BigFloat): boolean {
  return a.sign === 0 || a.m === 0;
}

export function bfIsPositive(a: BigFloat): boolean {
  return a.sign === 1 && a.m > 0;
}

export function bfAdd(a: BigFloat, b: BigFloat): BigFloat {
  if (a.sign === 0) return b;
  if (b.sign === 0) return a;

  // Ensure |a| >= |b| conceptually by exponent
  let big = a;
  let small = b;
  if (big.e < small.e || (big.e === small.e && big.m < small.m)) {
    big = b;
    small = a;
  }

  const diff = big.e - small.e;
  // Beyond 16 orders of magnitude, IEEE-754 mantissa precision makes small negligible
  if (diff > 16) {
    return big;
  }

  const scaledSmall = small.m * Math.pow(10, -diff);
  const combined =
    big.sign === small.sign ? big.m + scaledSmall : big.m - scaledSmall;

  if (Math.abs(combined) < 1e-15 && diff === 0) {
    return BF_ZERO;
  }
  return bfNormalize(
    combined >= 0 ? big.sign : -big.sign,
    Math.abs(combined),
    big.e
  );
}

export function bfSub(a: BigFloat, b: BigFloat): BigFloat {
  return bfAdd(a, bfNeg(b));
}

export function bfSubClampZero(a: BigFloat, b: BigFloat): BigFloat {
  if (bfLte(a, b)) return BF_ZERO;
  const res = bfSub(a, b);
  return res.sign <= 0 ? BF_ZERO : res;
}

export function bfMul(a: BigFloat, b: BigFloat): BigFloat {
  if (a.sign === 0 || b.sign === 0) return BF_ZERO;
  const sign = a.sign === b.sign ? 1 : -1;
  return bfNormalize(sign, a.m * b.m, a.e + b.e);
}

export function bfMulNum(a: BigFloat, n: number): BigFloat {
  if (a.sign === 0 || n === 0 || !Number.isFinite(n)) {
    return n === Infinity ? bfNormalize(a.sign, 9.999999, MAX_BF_EXPONENT) : BF_ZERO;
  }
  return bfMul(a, bf(n));
}

export function bfDiv(a: BigFloat, b: BigFloat): BigFloat {
  if (b.sign === 0) {
    return a.sign === 0
      ? BF_ZERO
      : { sign: a.sign, m: 9.999999999, e: MAX_BF_EXPONENT };
  }
  if (a.sign === 0) return BF_ZERO;
  const sign = a.sign === b.sign ? 1 : -1;
  return bfNormalize(sign, a.m / b.m, a.e - b.e);
}

export function bfDivNum(a: BigFloat, n: number): BigFloat {
  if (n === 0) return bfDiv(a, BF_ZERO);
  return bfDiv(a, bf(n));
}

export function bfLog10(a: BigFloat): number {
  if (a.sign <= 0 || a.m <= 0) return -Infinity;
  return Math.log10(a.m) + a.e;
}

export function bfLog10Safe(a: BigFloat, floorVal = 0): number {
  if (a.sign <= 0 || a.m <= 0) return floorVal;
  const v = Math.log10(a.m) + a.e;
  return Math.max(floorVal, v);
}

export function bfPowNum(a: BigFloat, power: number): BigFloat {
  if (power === 0) return BF_ONE;
  if (a.sign === 0) return power > 0 ? BF_ZERO : BF_ONE;
  if (power === 1) return a;

  const absLog10 = Math.log10(a.m) + a.e;
  const targetLog10 = absLog10 * power;

  if (!Number.isFinite(targetLog10) || targetLog10 > MAX_BF_EXPONENT) {
    return { sign: 1, m: 9.999999999, e: MAX_BF_EXPONENT };
  }
  if (targetLog10 < MIN_BF_EXPONENT) {
    return BF_ZERO;
  }

  const newExp = Math.floor(targetLog10);
  const frac = targetLog10 - newExp;
  const newMant = Math.pow(10, frac);

  let outSign: -1 | 1 = 1;
  if (a.sign < 0 && Number.isInteger(power) && Math.abs(power % 2) === 1) {
    outSign = -1;
  }

  return bfNormalize(outSign, newMant, newExp);
}

export function bfSqrt(a: BigFloat): BigFloat {
  if (a.sign <= 0) return BF_ZERO;
  return bfPowNum(a, 0.5);
}

export function bfToNumber(a: BigFloat): number {
  if (a.sign === 0) return 0;
  if (a.e > 307) return a.sign * Number.MAX_VALUE;
  if (a.e < -307) return 0;
  return a.sign * a.m * Math.pow(10, a.e);
}

export function bfFloor(a: BigFloat): BigFloat {
  if (a.sign <= 0) {
    if (a.sign === 0) return BF_ZERO;
  }
  if (a.e >= 15) return a;
  if (a.e < 0) return a.sign < 0 ? bf(-1) : BF_ZERO;
  const num = bfToNumber(a);
  return bf(Math.floor(num));
}

const INTL_SUFFIXES = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx"];
const ZH_UNITS: Array<{ exp: number; symbol: string }> = [
  { exp: 20, symbol: "垓" },
  { exp: 16, symbol: "京" },
  { exp: 12, symbol: "兆" },
  { exp: 8, symbol: "亿" },
  { exp: 4, symbol: "万" },
];

function trimTrailingZeros(fixed: string): string {
  if (!fixed.includes(".")) return fixed;
  return fixed.replace(/\.?0+$/, "");
}

function formatSmallValue(val: number, precision: number): string {
  const abs = Math.abs(val);
  if (abs === 0) return "0";
  if (abs >= 100) return Math.round(val).toString();
  if (abs >= 10) return trimTrailingZeros(val.toFixed(Math.min(1, precision)));
  return trimTrailingZeros(val.toFixed(precision));
}

function formatExponentCompact(e: number): string {
  const absE = Math.abs(e);
  if (absE < 100_000) return e.toString();
  if (absE < 1_000_000) return `${(e / 1_000).toFixed(1)}K`;
  return `${(e / 1_000_000).toFixed(2)}M`;
}

export function formatBigFloat(
  value: BigFloat | number,
  style: NumberFormatStyle = "intl",
  precision = 2
): string {
  const v = typeof value === "number" ? bf(value) : value;
  if (v.sign === 0) return "0";

  const prefix = v.sign < 0 ? "-" : "";

  if (v.e < 0) {
    if (v.e >= -2) {
      const small = v.m * Math.pow(10, v.e);
      return `${prefix}${trimTrailingZeros(small.toFixed(2))}`;
    }
    return `${prefix}${v.m.toFixed(precision)}e${v.e}`;
  }

  if (style === "sci") {
    if (v.e < 3) {
      return `${prefix}${formatSmallValue(v.m * Math.pow(10, v.e), precision)}`;
    }
    return `${prefix}${trimTrailingZeros(v.m.toFixed(precision))}e${formatExponentCompact(v.e)}`;
  }

  if (style === "zh") {
    if (v.e < 4) {
      return `${prefix}${formatSmallValue(v.m * Math.pow(10, v.e), precision)}`;
    }
    if (v.e < 24) {
      for (const unit of ZH_UNITS) {
        if (v.e >= unit.exp) {
          const scaled = v.m * Math.pow(10, v.e - unit.exp);
          return `${prefix}${formatSmallValue(scaled, precision)}${unit.symbol}`;
        }
      }
    }
    return `${prefix}${trimTrailingZeros(v.m.toFixed(precision))}e${formatExponentCompact(v.e)}`;
  }

  // Default: "intl" (K / M / B / T / Qa / Qi / Sx -> 1.25e24)
  if (v.e < 3) {
    return `${prefix}${formatSmallValue(v.m * Math.pow(10, v.e), precision)}`;
  }
  const tier = Math.floor(v.e / 3);
  if (tier < INTL_SUFFIXES.length) {
    const scaled = v.m * Math.pow(10, v.e - tier * 3);
    return `${prefix}${formatSmallValue(scaled, precision)}${INTL_SUFFIXES[tier]}`;
  }

  return `${prefix}${trimTrailingZeros(v.m.toFixed(precision))}e${formatExponentCompact(v.e)}`;
}
