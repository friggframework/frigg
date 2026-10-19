/**
 * Expressions for data-defined integrations (v0.1).
 *
 * Three forms, and no others (nothing is ever passed to eval):
 *   1. Reference   "$.event.contact.id"     A string that is exactly a path. Resolves to the value, keeping its type.
 *   2. Template    "Call with {{event.from}}" A string with {{path | filter}} parts. Resolves to a string, except
 *                  that a string which is exactly one tag ("{{record.amount | to_cents}}") keeps the value's type, so
 *                  a filter can produce a number or a list for an API argument.
 *   3. Condition   "$.steps.contact == null && $.event.duration > 30"  Used by `when` and trigger filters.
 *
 * Paths are read from a context object: { event, steps, settings, install, vars, item, record, now }.
 * A missing segment resolves to undefined; it never throws.
 */

const PATH_RE = /^\$\.[A-Za-z_][\w-]*(\.[\w-]+|\[\d+\])*$/;

function getPath(ctx, path) {
    const clean = path.replace(/^\$\./, '');
    let cur = ctx;
    for (const seg of clean.split(/\.|(?=\[)/)) {
        if (cur == null) return undefined;
        const m = /^\[(\d+)\]$/.exec(seg);
        cur = m ? cur[Number(m[1])] : cur[seg];
    }
    return cur;
}

const num = (v) => (v == null || v === '' ? null : Number(v));
const arith = (f) => (v, arg) => { const a = num(v), b = num(arg); return a == null || b == null || Number.isNaN(a) || Number.isNaN(b) ? null : f(a, b); };

/**
 * Template filters. Each is a named, total function of (value, argument): no filter loops, calls out or throws on
 * bad input (a non-number gives null, which renders as ''). Arithmetic is here, as named filters, instead of an
 * expression language: {{item.amount | to_cents}}, {{record.created | from_unix}}.
 */
// ISO 4217 minor-unit exponents that are not 2 (Stripe's zero-decimal and three-decimal lists).
const MINOR_EXPONENT = { BIF: 0, CLP: 0, DJF: 0, GNF: 0, JPY: 0, KMF: 0, KRW: 0, MGA: 0, PYG: 0, RWF: 0, UGX: 0, VND: 0, VUV: 0, XAF: 0, XOF: 0, XPF: 0, BHD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3 };
const exponentOf = (currency) => MINOR_EXPONENT[String(currency || '').toUpperCase()] ?? 2;
/** a * 10^e, rounded half-up in decimal (19.995 -> 1999.5 -> 2000; 19.995 * 100 is 1999.4999... in binary). */
const shiftRound = (a, e) => Math.round(Number(`${a}e${e}`));

const FILTERS = {
    upper: (v) => String(v ?? '').toUpperCase(),
    lower: (v) => String(v ?? '').toLowerCase(),
    minutes: (v) => (v == null ? '' : String(Math.round(Number(v) / 60000))),
    seconds: (v) => (v == null ? '' : String(Math.round(Number(v) / 1000))),
    date: (v) => (v ? new Date(v).toISOString().slice(0, 10) : ''),
    json: (v) => JSON.stringify(v),
    // Record data inside a Slack message: escaped so a name like "*x* <!channel>" neither formats nor pings.
    mrkdwn: (v) => require('./renderers/slack').escapeMrkdwn(v),
    default: (v, arg) => (v == null || v === '' ? arg : v),
    truncate: (v, arg) => { const s = String(v ?? ''); const n = Number(arg) || 80; return s.length > n ? s.slice(0, n - 1) + '…' : s; },
    // lists
    join: (v, arg) => (Array.isArray(v) ? v.filter((x) => x != null && x !== '').join(arg ?? ', ') : v),
    size: (v) => (Array.isArray(v) || typeof v === 'string' ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0),
    first: (v) => (Array.isArray(v) ? v[0] : v),
    last: (v) => (Array.isArray(v) ? v[v.length - 1] : v),
    split: (v, arg) => (typeof v === 'string' ? v.split(arg ?? ',') : v),
    // arithmetic
    plus: arith((a, b) => a + b),
    minus: arith((a, b) => a - b),
    times: arith((a, b) => a * b),
    divided_by: arith((a, b) => (b === 0 ? null : a / b)),
    // Rounded in decimal-exponent form, so 1.005 | round: 2 is 1.01 (1.005 * 100 is 100.49999... in binary floating point).
    round: (v, arg) => { const a = num(v); if (a == null || Number.isNaN(a)) return null; const d = Math.max(0, Math.min(10, Number(arg) || 0)); return Number(`${shiftRound(a, d)}e-${d}`); },
    abs: (v) => { const a = num(v); return a == null || Number.isNaN(a) ? null : Math.abs(a); },
    number: (v) => { const a = num(v); return a == null || Number.isNaN(a) ? null : a; },
    // money in minor units, rounded so 19.99 -> 1999 (19.99 * 100 is 1998.9999999999998)
    to_cents: (v) => { const a = num(v); return a == null || Number.isNaN(a) ? null : shiftRound(a, 2); },
    from_cents: (v) => { const a = num(v); return a == null || Number.isNaN(a) ? null : Math.round(a) / 100; },
    // the same for any currency: {{record.amount | from_minor_units: record.currency}} (JPY has no minor unit, KWD three)
    to_minor_units: (v, cur) => { const a = num(v); if (a == null || Number.isNaN(a)) return null; return shiftRound(a, exponentOf(cur)); },
    from_minor_units: (v, cur) => { const a = num(v); if (a == null || Number.isNaN(a)) return null; const e = exponentOf(cur); return Math.round(a) / 10 ** e; },
    // unix seconds <-> ISO 8601
    from_unix: (v) => { const a = num(v); return a == null || Number.isNaN(a) ? null : new Date(a * 1000).toISOString(); },
    to_unix: (v) => { const t = v ? Date.parse(v) : NaN; return Number.isNaN(t) ? null : Math.floor(t / 1000); },
};

/** A filter argument is a quoted literal ('x'), a number, or a path read from the context (steps.full.owner). */
function filterArg(raw, ctx) {
    if (raw == null) return undefined;
    const a = raw.trim();
    if (/^'.*'$/.test(a)) return a.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
    if (/^-?\d+(\.\d+)?$/.test(a)) return a;
    return getPath(ctx, '$.' + a.replace(/^\$\./, ''));
}

const TAG_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const SINGLE_TAG_RE = /^\{\{\s*([^}]+?)\s*\}\}$/;

/** Split one tag's expression into its path and filters: "item.amount | times: 100" -> { path, filters: [{ name, arg }] }. */
function parseTag(expr) {
    const [p, ...filters] = expr.split('|').map((x) => x.trim());
    return { path: p.replace(/^\$\./, ''), filters: filters.map((f) => { const m = /^(\w+)(?::\s*(.*))?$/.exec(f); return m ? { name: m[1], arg: m[2] } : { name: f, arg: undefined, bad: true }; }) };
}

function evalTag(expr, ctx) {
    const { path, filters } = parseTag(expr);
    let v = getPath(ctx, '$.' + path);
    for (const f of filters) {
        const fn = !f.bad && FILTERS[f.name];
        if (!fn) throw new Error(`Unknown template filter "${f.name}"`);
        v = fn(v, filterArg(f.arg, ctx));
    }
    return v;
}

function renderTemplate(str, ctx) {
    const single = SINGLE_TAG_RE.exec(str);
    if (single) return evalTag(single[1], ctx) ?? '';
    return str.replace(TAG_RE, (_, expr) => {
        const v = evalTag(expr, ctx);
        return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
}

/** Every tag in a value (deep), for validation: [{ path, filters }]. */
function templateTags(value, acc = []) {
    if (typeof value === 'string') for (const m of value.matchAll(TAG_RE)) acc.push(parseTag(m[1]));
    else if (Array.isArray(value)) value.forEach((v) => templateTags(v, acc));
    else if (value && typeof value === 'object') Object.values(value).forEach((v) => templateTags(v, acc));
    return acc;
}

/** Resolve every reference and template inside a value (deep). Non-string scalars pass through. */
function resolve(value, ctx) {
    if (typeof value === 'string') {
        if (PATH_RE.test(value)) return getPath(ctx, value);
        if (value.includes('{{')) return renderTemplate(value, ctx);
        return value;
    }
    if (Array.isArray(value)) return value.map((v) => resolve(v, ctx));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = resolve(v, ctx);
        return out;
    }
    return value;
}

// ---------- conditions ----------
const TOKEN_RE = /\s*(\$\.[A-Za-z_][\w.\-[\]]*|'(?:[^'\\]|\\.)*'|-?\d+(?:\.\d+)?|==|!=|>=|<=|&&|\|\||[()!<>]|\bin\b|\bcontains\b|\bexists\b|\btrue\b|\bfalse\b|\bnull\b)/y;

function tokenize(src) {
    const out = [];
    TOKEN_RE.lastIndex = 0;
    let pos = 0;
    while (pos < src.length) {
        if (/^\s*$/.test(src.slice(pos))) break;
        TOKEN_RE.lastIndex = pos;
        const m = TOKEN_RE.exec(src);
        if (!m) throw new Error(`Cannot parse condition near "${src.slice(pos, pos + 20)}"`);
        out.push(m[1]);
        pos = TOKEN_RE.lastIndex;
    }
    return out;
}

/** Parse a condition into a small AST. Grammar: or := and ('||' and)* ; and := not ('&&' not)* ; not := '!' not | cmp ; cmp := atom (op atom | 'exists')? */
function parseCondition(src) {
    const t = tokenize(src);
    let i = 0;
    const peek = () => t[i];
    const next = () => t[i++];
    function atom() {
        const tok = next();
        if (tok === undefined) throw new Error(`Condition ends early: "${src}"`);
        if (tok === '(') { const e = or(); if (next() !== ')') throw new Error(`Missing ) in "${src}"`); return e; }
        if (tok.startsWith('$.')) return { ref: tok };
        if (tok.startsWith("'")) return { lit: tok.slice(1, -1).replace(/\\'/g, "'") };
        if (tok === 'true' || tok === 'false') return { lit: tok === 'true' };
        if (tok === 'null') return { lit: null };
        if (/^-?\d/.test(tok)) return { lit: Number(tok) };
        throw new Error(`Unexpected "${tok}" in "${src}"`);
    }
    function cmp() {
        const left = atom();
        const op = peek();
        if (op === 'exists') { next(); return { op: 'exists', left }; }
        if (['==', '!=', '>', '>=', '<', '<=', 'in', 'contains'].includes(op)) { next(); return { op, left, right: atom() }; }
        return { op: 'truthy', left };
    }
    function not() { if (peek() === '!') { next(); return { op: '!', left: not() }; } return cmp(); }
    function and() { let l = not(); while (peek() === '&&') { next(); l = { op: '&&', left: l, right: not() }; } return l; }
    function or() { let l = and(); while (peek() === '||') { next(); l = { op: '||', left: l, right: and() }; } return l; }
    const ast = or();
    if (i < t.length) throw new Error(`Unexpected "${t[i]}" in "${src}"`);
    return ast;
}

function evalAst(n, ctx) {
    if ('ref' in n) return getPath(ctx, n.ref);
    if ('lit' in n) return n.lit;
    const L = () => evalAst(n.left, ctx), R = () => evalAst(n.right, ctx);
    switch (n.op) {
        case 'truthy': return Boolean(L());
        case 'exists': return L() != null;
        case '!': return !evalAst(n.left, ctx);
        case '&&': return Boolean(L()) && Boolean(R());
        case '||': return Boolean(L()) || Boolean(R());
        case '==': return L() == R(); // eslint-disable-line eqeqeq -- null == undefined is intended
        case '!=': return L() != R(); // eslint-disable-line eqeqeq
        case '>': return L() > R();
        case '>=': return L() >= R();
        case '<': return L() < R();
        case '<=': return L() <= R();
        case 'in': { const r = R(); return Array.isArray(r) ? r.includes(L()) : typeof r === 'string' && r.includes(String(L())); }
        case 'contains': { const l = L(); return Array.isArray(l) ? l.includes(R()) : String(l ?? '').includes(String(R())); }
        default: throw new Error(`Unknown operator ${n.op}`);
    }
}

function evaluate(condition, ctx) {
    if (condition == null) return true;
    return Boolean(evalAst(parseCondition(condition), ctx));
}

/** Every $.root referenced by an expression-bearing value (for validation). */
function referencedPaths(value, acc = []) {
    if (typeof value === 'string') {
        if (PATH_RE.test(value)) acc.push(value);
        for (const m of value.matchAll(/\{\{\s*([^}|]+?)\s*(\|[^}]*)?\}\}/g)) acc.push('$.' + m[1].replace(/^\$\./, ''));
        for (const m of value.matchAll(/\$\.[A-Za-z_][\w.\-[\]]*/g)) if (!acc.includes(m[0])) acc.push(m[0]);
    } else if (Array.isArray(value)) value.forEach((v) => referencedPaths(v, acc));
    else if (value && typeof value === 'object') Object.values(value).forEach((v) => referencedPaths(v, acc));
    return acc;
}

module.exports = { getPath, resolve, renderTemplate, evaluate, parseCondition, referencedPaths, templateTags, FILTERS };
