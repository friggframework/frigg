#!/usr/bin/env node
/**
 * Check capability manifests against the real API modules they describe (ADR-063 phase 4: real manifests).
 *
 *   node scripts/check-manifests.js <modules-dir> [<modules-dir> ...]
 *   node scripts/check-manifests.js --manifests capabilities/ --json ~/api-module-library/packages
 *   node scripts/check-manifests.js --stub-missing --strict ~/api-module-library/packages
 *
 * For every manifest it finds the module (a directory named <module> or api-module-<module>, or whose package.json
 * name ends in that, up to three levels under each given directory; the first one that loads wins), loads its Api
 * class and checks, with no network and no instance, on the prototype:
 *   - every capability's `method` exists (a capability marked `status: "unimplemented"` must NOT have it: the
 *     manifest would be stale);
 *   - the arguments fit the method's declared parameters: `args` no longer than the parameter list, and a
 *     capability with no `args` (called with one object) is not a method that needs two or more positional ones;
 *   - `webhook.verify` names a method that exists.
 *
 * Exit codes: 0 every method found (unimplemented capabilities and modules with no source are reported, not failed,
 * unless --strict) · 1 a mismatch · 2 could not run (bad arguments, no manifests).
 *
 *   --manifests <dir>   manifests to check (default: ../capabilities)
 *   --json              machine-readable result on stdout
 *   --strict            unimplemented capabilities, unloadable modules and modules not found fail too
 *   --stub-missing      load modules whose own dependencies are not installed (jsforce, stripe, @linear/sdk ...) by
 *                       standing in for the missing packages; enough to read the Api's methods, never to call them
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const FOUND = 'ok';

/** Parameters of a function as written: [{ name, optional }]. Reads the source, so it is a heuristic for the arity check. */
function parametersOf(fn) {
    const src = Function.prototype.toString.call(fn);
    const bare = /^(?:async\s+)?([\w$]+)\s*=>/.exec(src);
    if (bare) return [{ text: bare[1], optional: false }];
    const open = src.indexOf('(');
    if (open < 0) return [];
    let depth = 0, i = open, cur = '';
    const parts = [];
    for (; i < src.length; i++) {
        const c = src[i];
        if ('([{'.includes(c)) { depth++; if (depth === 1) continue; }
        if (')]}'.includes(c)) { depth--; if (depth === 0) break; }
        if (c === ',' && depth === 1) { parts.push(cur); cur = ''; } else cur += c;
    }
    if (cur.trim()) parts.push(cur);
    return parts.map((p) => p.replace(/\/\*[\s\S]*?\*\//g, '').trim()).filter(Boolean).map((p) => ({ text: p.replace(/\s+/g, ' '), optional: /^\.\.\./.test(p) || p.includes('=') || /^[\w$]+\s*\?/.test(p) }));
}

function methodOf(Api, name) {
    for (let p = Api && Api.prototype; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) {
        const d = Object.getOwnPropertyDescriptor(p, name);
        if (d) return typeof d.value === 'function' ? d.value : null;
    }
    return null;
}

const signatureOf = (fn) => `(${parametersOf(fn).map((p) => p.text).join(', ')})`;

const looksLikeModule = (dir) => ['package.json', 'index.js', 'api.js'].some((f) => fs.existsSync(path.join(dir, f)));

/** Directories that could be the module: name match, up to `depth` levels below root. */
function candidates(root, moduleName, depth = 3) {
    const found = [];
    const isMatch = (dir) => {
        const base = path.basename(dir);
        if (base === moduleName || base === `api-module-${moduleName}`) return true;
        try { return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name?.endsWith(`api-module-${moduleName}`); } catch { return false; }
    };
    const walk = (dir, level) => {
        if (level > depth) return;
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (!e.isDirectory() || e.name === 'node_modules' || e.name.startsWith('.')) continue;
            const full = path.join(dir, e.name);
            if (isMatch(full) && looksLikeModule(full)) found.push(full);
            else walk(full, level + 1);
        }
    };
    if (isMatch(root) && looksLikeModule(root)) found.push(root);
    walk(root, 1);
    return found;
}

/** Stand-ins for dependencies that are not installed, so an Api's methods can be read. Restored by the caller. */
function stubMissingDependencies() {
    const original = Module._load;
    const stub = () => new Proxy(function stubbed() {}, { get: (t, k) => (k === '__esModule' ? false : k === 'prototype' ? t.prototype : t[k] || (t[k] = stub())), construct: () => ({}), apply: () => stub() });
    Module._load = function load(request, ...rest) {
        try { return original.call(this, request, ...rest); } catch (e) {
            if (e && e.code === 'MODULE_NOT_FOUND' && !request.startsWith('.') && !path.isAbsolute(request)) return stub();
            throw e;
        }
    };
    return () => { Module._load = original; };
}

function loadApi(dir) {
    const attempts = [dir, path.join(dir, 'api.js'), path.join(dir, 'src', 'api.js'), path.join(dir, 'dist', 'api.js')];
    let firstError;
    for (const target of attempts) {
        try {
            const mod = require(target);
            const Api = mod.Api || mod.API || mod.Definition?.API || (typeof mod === 'function' ? mod : null);
            if (typeof Api === 'function' && Api.prototype) return { Api, from: path.relative(dir, require.resolve(target)) || '.' };
            firstError = firstError || new Error('exports no Api class');
        } catch (e) { firstError = firstError || e; } // the first failure is the module's own; later ones are only missing fallbacks
    }
    return { error: (firstError?.message || 'cannot load').split('\n')[0] };
}

/**
 * @param {Record<string, object>} manifests  module -> manifest
 * @param {string[]} roots                    directories to look for the modules in
 * @returns {Array<{module, package?, source?, state, message?, rows: Array<{capability, method, state, signature?, args?, note?}>}>}
 */
function checkManifests(manifests, roots, { stubMissing = false } = {}) {
    const restore = stubMissing ? stubMissingDependencies() : null;
    try {
        return Object.values(manifests).map((m) => {
            const result = { module: m.module, package: m.package, state: FOUND, rows: [] };
            const dirs = roots.flatMap((r) => candidates(path.resolve(r), m.module));
            if (!dirs.length) return { ...result, state: 'no-module', message: `No directory named ${m.module} or api-module-${m.module} under ${roots.join(', ')}` };
            let loaded, failures = [];
            for (const dir of dirs) {
                const l = loadApi(dir);
                if (l.Api) { loaded = { ...l, dir }; break; }
                failures.push(`${dir}: ${l.error}`);
            }
            if (!loaded) return { ...result, state: 'unloadable', message: failures.join('; ') };
            result.source = loaded.dir;
            const { Api } = loaded;
            for (const [name, c] of Object.entries(m.capabilities || {})) {
                const fn = methodOf(Api, c.method);
                const row = { capability: name, method: c.method };
                if (c.status === 'unimplemented') {
                    row.state = fn ? 'stale-unimplemented' : 'unimplemented';
                    row.note = fn ? `Marked unimplemented, but ${c.method}${signatureOf(fn)} exists: ${c.note || 'no note says why it cannot be used'}` : c.note;
                    if (fn) row.signature = signatureOf(fn);
                } else if (!fn) {
                    row.state = 'missing';
                } else {
                    row.signature = signatureOf(fn);
                    const params = parametersOf(fn);
                    const required = params.filter((p) => !p.optional).length;
                    if (c.args) {
                        row.args = c.args.map((a) => (typeof a === 'string' ? a : `=${JSON.stringify(a.value)}`)).join(', ');
                        row.state = c.args.length > params.length && !params.some((p) => p.text.startsWith('...')) ? 'arity' : 'ok';
                        if (row.state === 'arity') row.note = `Passes ${c.args.length} arguments; ${c.method} declares ${params.length}`;
                    } else {
                        row.state = required > 1 ? 'arity' : 'ok';
                        if (row.state === 'arity') row.note = `Called with one object; ${c.method} needs ${required} positional arguments (add args)`;
                    }
                    if (c.note) row.note = [row.note, c.note].filter(Boolean).join('. ');
                }
                result.rows.push(row);
            }
            if (m.webhook?.verify) {
                const fn = methodOf(Api, m.webhook.verify);
                const marked = m.webhook.status === 'unimplemented';
                result.rows.push({ capability: 'webhook.verify', method: m.webhook.verify, state: fn ? (marked ? 'stale-unimplemented' : 'ok') : marked ? 'unimplemented' : 'missing', ...(fn ? { signature: signatureOf(fn) } : {}), ...(m.webhook.note ? { note: m.webhook.note } : {}) });
            }
            return result;
        });
    } finally { if (restore) restore(); }
}

// stale-unimplemented is soft: the method exists but the note may say why it cannot be used as the capability is shaped.
const BAD = new Set(['missing', 'arity']);
const SOFT = new Set(['unimplemented', 'stale-unimplemented', 'unloadable', 'no-module']);

function summarise(results) {
    const counts = {};
    for (const r of results) {
        counts[r.state] = (counts[r.state] || 0) + (r.state === FOUND ? 0 : 1);
        for (const row of r.rows) counts[row.state] = (counts[row.state] || 0) + 1;
    }
    const mismatches = results.flatMap((r) => r.rows.filter((x) => BAD.has(x.state)));
    const soft = results.filter((r) => SOFT.has(r.state)).length + results.flatMap((r) => r.rows).filter((x) => SOFT.has(x.state)).length;
    return { counts, mismatches: mismatches.length, soft };
}

function main(argv) {
    const args = [...argv];
    const flag = (n) => { const i = args.indexOf(n); if (i < 0) return false; args.splice(i, 1); return true; };
    const option = (n) => { const i = args.indexOf(n); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
    const strict = flag('--strict'), asJson = flag('--json'), stubMissing = flag('--stub-missing');
    const manifestDir = option('--manifests') || path.join(__dirname, '..', 'capabilities');
    const unknown = args.find((a) => a.startsWith('--'));
    if (unknown) { console.error(`Unknown option ${unknown}`); return 2; }
    if (!args.length) { console.error('Usage: check-manifests.js [--manifests dir] [--json] [--strict] [--stub-missing] <modules-dir> [...]'); return 2; }
    for (const r of args) if (!fs.existsSync(r)) { console.error(`No such directory: ${r}`); return 2; }
    if (!fs.existsSync(manifestDir)) { console.error(`No such directory: ${manifestDir}`); return 2; }
    const manifests = {};
    for (const f of fs.readdirSync(manifestDir).filter((x) => x.endsWith('.capabilities.json'))) {
        try { const m = JSON.parse(fs.readFileSync(path.join(manifestDir, f), 'utf8')); manifests[m.module] = m; } catch (e) { console.error(`${f}: not valid JSON (${e.message})`); return 2; }
    }
    if (!Object.keys(manifests).length) { console.error(`No *.capabilities.json in ${manifestDir}`); return 2; }

    const results = checkManifests(manifests, args, { stubMissing });
    const sum = summarise(results);
    const failed = sum.mismatches > 0 || (strict && sum.soft > 0);
    if (asJson) process.stdout.write(`${JSON.stringify({ valid: !failed, strict, summary: sum, results }, null, 2)}\n`);
    else {
        for (const r of results) {
            if (r.state !== FOUND) { console.log(`${strict ? 'FAIL' : 'skip'} ${r.module.padEnd(12)} ${r.state}: ${r.message}`); continue; }
            const bad = r.rows.filter((x) => BAD.has(x.state)).length;
            console.log(`${bad ? 'FAIL' : 'ok  '} ${r.module.padEnd(12)} ${r.rows.filter((x) => x.state === 'ok').length}/${r.rows.length} ok  (${path.relative(process.cwd(), r.source) || '.'})`);
            for (const x of r.rows.filter((y) => y.state !== 'ok')) console.log(`       ${x.state.padEnd(20)} ${x.capability} -> ${x.method}${x.note ? `  ${x.note}` : ''}`);
        }
        console.log(`\n${results.length} manifests: ${sum.mismatches} mismatches, ${sum.soft} unverifiable or unimplemented${strict ? ' (strict)' : ''}`);
    }
    return failed ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { checkManifests, summarise, parametersOf, methodOf, candidates };
