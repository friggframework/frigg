/**
 * Expressions for data-defined integrations (v0.1).
 *
 * Three forms, and no others (nothing is ever passed to eval):
 *   1. Reference   "$.event.contact.id"     A string that is exactly a path. Resolves to the value, keeping its type.
 *   2. Template    "Call with {{event.from}}" A string with {{path | filter}} parts. Always resolves to a string.
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

const FILTERS = {
    upper: (v) => String(v ?? '').toUpperCase(),
    lower: (v) => String(v ?? '').toLowerCase(),
    minutes: (v) => (v == null ? '' : String(Math.round(Number(v) / 60000))),
    seconds: (v) => (v == null ? '' : String(Math.round(Number(v) / 1000))),
    date: (v) => (v ? new Date(v).toISOString().slice(0, 10) : ''),
    json: (v) => JSON.stringify(v),
    default: (v, arg) => (v == null || v === '' ? arg : v),
    truncate: (v, arg) => { const s = String(v ?? ''); const n = Number(arg) || 80; return s.length > n ? s.slice(0, n - 1) + '…' : s; },
};

/** A filter argument is a quoted literal ('x'), a number, or a path read from the context (steps.full.owner). */
function filterArg(raw, ctx) {
    if (raw == null) return undefined;
    const a = raw.trim();
    if (/^'.*'$/.test(a)) return a.slice(1, -1);
    if (/^-?\d+(\.\d+)?$/.test(a)) return a;
    return getPath(ctx, '$.' + a.replace(/^\$\./, ''));
}

function renderTemplate(str, ctx) {
    return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
        const [p, ...filters] = expr.split('|').map((s) => s.trim());
        let v = getPath(ctx, '$.' + p.replace(/^\$\./, ''));
        for (const f of filters) {
            const m = /^(\w+)(?::\s*(.*))?$/.exec(f);
            const fn = m && FILTERS[m[1]];
            if (!fn) throw new Error(`Unknown template filter "${f}"`);
            v = fn(v, filterArg(m[2], ctx));
        }
        return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
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

module.exports = { getPath, resolve, renderTemplate, evaluate, parseCondition, referencedPaths, FILTERS };
