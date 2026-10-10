/** Minimal Python `repr()` of JSON-like values, used to reproduce Python error messages. */
export function pyRepr(v) {
    if (v === null || v === undefined)
        return "None";
    if (v === true)
        return "True";
    if (v === false)
        return "False";
    if (typeof v === "number") {
        if (Number.isNaN(v))
            return "nan";
        if (!Number.isFinite(v))
            return v > 0 ? "inf" : "-inf";
        return String(v);
    }
    if (typeof v === "string") {
        const q = v.includes("'") && !v.includes('"') ? '"' : "'";
        const body = v.replace(/\\/g, "\\\\").replace(new RegExp(q, "g"), "\\" + q).replace(/\n/g, "\\n");
        return q + body + q;
    }
    if (Array.isArray(v))
        return "[" + v.map(pyRepr).join(", ") + "]";
    if (typeof v === "object") {
        return "{" + Object.entries(v).map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(", ") + "}";
    }
    return String(v);
}
