/**
 * Exact port of Python's `round(x, ndigits)` for floats (CPython `double_round`):
 * the exact binary value of `x` is rounded to `ndigits` decimals with
 * round-half-even, and the resulting decimal string is parsed back to the
 * nearest double. Implemented with BigInt so ties and near-ties match Python
 * bit-for-bit (`Number.prototype.toFixed` rounds ties away from zero and would not).
 */
export declare function pyRound(x: number, ndigits?: number): number;
/** Python `rescue_sim.env._r`: `float(round(x, 10))`. */
export declare function r10(x: number): number;
