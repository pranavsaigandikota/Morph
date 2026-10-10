/**
 * Exact port of Python's `round(x, ndigits)` for floats (CPython `double_round`):
 * the exact binary value of `x` is rounded to `ndigits` decimals with
 * round-half-even, and the resulting decimal string is parsed back to the
 * nearest double. Implemented with BigInt so ties and near-ties match Python
 * bit-for-bit (`Number.prototype.toFixed` rounds ties away from zero and would not).
 */
export function pyRound(x, ndigits = 10) {
    if (!Number.isFinite(x) || x === 0)
        return x; // keeps -0, NaN, +-Infinity like Python
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, x);
    const hi = view.getUint32(0);
    const lo = view.getUint32(4);
    const negative = hi >>> 31 === 1;
    const expBits = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    let e;
    if (expBits === 0) {
        e = -1074; // subnormal
    }
    else {
        mant |= 1n << 52n;
        e = expBits - 1075;
    }
    // |x| = mant * 2^e exactly
    const scale = 10n ** BigInt(ndigits);
    let n;
    if (e >= 0) {
        n = mant * scale * (1n << BigInt(e));
    }
    else {
        const num = mant * scale;
        const den = 1n << BigInt(-e);
        n = num / den;
        const twiceRem = 2n * (num - n * den);
        if (twiceRem > den || (twiceRem === den && (n & 1n) === 1n))
            n += 1n;
    }
    let digits = n.toString();
    if (digits.length <= ndigits)
        digits = digits.padStart(ndigits + 1, "0");
    const text = `${digits.slice(0, digits.length - ndigits)}.${digits.slice(digits.length - ndigits)}`;
    const value = Number(text);
    return negative ? -value : value;
}
/** Python `rescue_sim.env._r`: `float(round(x, 10))`. */
export function r10(x) {
    return pyRound(x, 10);
}
