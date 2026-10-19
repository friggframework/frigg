/** Field transforms used by sync mappings and the `map` step (v0.1). Pure functions: (value, options, record) -> value. */
const TRANSFORMS = {
    none: (v) => v,
    trim: (v) => (typeof v === 'string' ? v.trim() : v),
    lowercase: (v) => (typeof v === 'string' ? v.toLowerCase() : v),
    uppercase: (v) => (typeof v === 'string' ? v.toUpperCase() : v),
    number: (v) => (v == null || v === '' ? undefined : Number(v)),
    boolean: (v) => (v == null ? undefined : v === true || v === 'true' || v === 1 || v === '1'),
    to_iso_date: (v) => { if (!v) return undefined; const d = new Date(v); return isNaN(d) ? undefined : d.toISOString(); },
    /** Digits with a leading +. A 10-digit number is assumed to be NANP (options.defaultCountry overrides). */
    to_e164_phone: (v, o = {}) => {
        if (v == null || v === '') return undefined;
        const s = String(v).trim();
        const digits = s.replace(/\D/g, '');
        if (!digits) return undefined;
        if (s.startsWith('+')) return '+' + digits;
        if (digits.length === 10) return (o.defaultCountry === 'GB' ? '+44' : '+1') + digits;
        if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
        return '+' + digits;
    },
    split_full_name: (v, o = {}) => {
        if (!v) return undefined;
        const parts = String(v).trim().split(/\s+/);
        return o.part === 'last' ? parts.slice(1).join(' ') || undefined : parts[0];
    },
    join: (v, o = {}, record = {}) => (o.fields || []).map((f) => readField(record, f)).filter((x) => x != null && x !== '').join(o.separator ?? ' ') || undefined,
    map_values: (v, o = {}) => (v == null ? undefined : (o.values || {})[v] ?? o.fallback),
    default: (v, o = {}) => (v == null || v === '' ? o.value : v),
    // money and time, rounded and total (bad input -> undefined, which the mapping leaves out)
    units_to_cents: (v) => { const n = v == null || v === '' ? NaN : Number(v); return Number.isNaN(n) ? undefined : Math.round(Number(`${n}e2`)); },
    cents_to_units: (v) => { const n = v == null || v === '' ? NaN : Number(v); return Number.isNaN(n) ? undefined : Math.round(n) / 100; },
    from_unix_seconds: (v) => { const n = v == null || v === '' ? NaN : Number(v); return Number.isNaN(n) ? undefined : new Date(n * 1000).toISOString(); },
    to_unix_seconds: (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? undefined : Math.floor(t / 1000); },
};

function readField(record, path) {
    let cur = record;
    for (const seg of String(path).split(/\.|(?=\[)/)) {
        if (cur == null) return undefined;
        const m = /^\[(\d+)\]$/.exec(seg);
        cur = m ? cur[Number(m[1])] : cur[seg];
    }
    return cur;
}

function writeField(target, path, value) {
    const segs = String(path).split(/\.|(?=\[)/);
    let cur = target;
    segs.forEach((seg, i) => {
        const m = /^\[(\d+)\]$/.exec(seg);
        const key = m ? Number(m[1]) : seg;
        if (i === segs.length - 1) { cur[key] = value; return; }
        const nextIsIndex = /^\[\d+\]$/.test(segs[i + 1]);
        if (cur[key] == null) cur[key] = nextIsIndex ? [] : {};
        cur = cur[key];
    });
    return target;
}

/**
 * Apply a field mapping to a record. A blank result is left out, never written (a blank must not overwrite a value).
 * A row either reads `source` from the record or writes a fixed `value` (QuickBooks' Line[0].DetailType, a lifecycle
 * stage): { target, value }. A fixed value still goes through the row's transform.
 * @param {Array<{source?:string,value?:any,target:string,transform?:string,options?:object}>} rows
 */
function applyMapping(rows, record) {
    const out = {};
    for (const r of rows || []) {
        const fn = TRANSFORMS[r.transform || 'none'];
        if (!fn) throw new Error(`Unknown transform "${r.transform}"`);
        const input = 'value' in r ? r.value : readField(record, r.source);
        const v = fn(input, r.options || {}, record);
        if (v === undefined || v === null || v === '') continue;
        writeField(out, r.target, v);
    }
    return out;
}

/** Deep merge, later objects win; arrays and scalars are replaced, not merged. Inputs are not modified. */
function deepMerge(...objects) {
    const out = {};
    for (const o of objects) {
        if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
        for (const [k, v] of Object.entries(o)) {
            out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k]) ? deepMerge(out[k], v) : v;
        }
    }
    return out;
}

module.exports = { TRANSFORMS, applyMapping, readField, writeField, deepMerge };
