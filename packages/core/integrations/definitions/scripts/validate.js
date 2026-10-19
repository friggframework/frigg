#!/usr/bin/env node
/**
 * Validate integration definitions and capability manifests: JSON Schema, then references.
 *
 *   node scripts/validate.js                       every bundled manifest and example
 *   node scripts/validate.js my.definition.json    one or more definitions (files or directories)
 *   node scripts/validate.js --manifests dir/ ...  check against manifests in another directory
 *   node scripts/validate.js --strict ...          warnings fail too
 *   node scripts/validate.js --json ...            machine-readable result on stdout
 *
 * Exit codes: 0 valid · 1 invalid · 2 could not run (bad arguments, unreadable file, ajv missing).
 * Manifests are always checked first, because a definition is only as trustworthy as the manifests it is checked
 * against: an invalid manifest fails the run even if every definition passes.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const option = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };

const strict = flag('--strict');
const asJson = flag('--json');
const manifestDir = option('--manifests') || path.join(root, 'capabilities');
const unknown = args.find((a) => a.startsWith('--'));
if (unknown) { console.error(`Unknown option ${unknown}`); process.exit(2); }

const jsonFiles = (p) => {
    if (!fs.existsSync(p)) { console.error(`No such file or directory: ${p}`); process.exit(2); }
    return fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => path.join(p, f)) : [p];
};
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error(`${f}: not valid JSON (${e.message})`); process.exit(2); } };

let check;
try { check = require('../schema-check'); check.loadAjv(); } catch (e) { console.error(e.message); process.exit(2); }

const manifestFiles = jsonFiles(manifestDir).filter((f) => f.endsWith('.capabilities.json'));
const definitionFiles = (args.length ? args : [path.join(root, 'examples')]).flatMap(jsonFiles).filter((f) => !f.endsWith('.capabilities.json') && !f.includes(`${path.sep}records${path.sep}`));

const manifests = {};
const results = [];
for (const f of manifestFiles) {
    const m = readJson(f);
    manifests[m.module] = m;
    results.push({ kind: 'manifest', file: path.relative(process.cwd(), f), name: m.module, ...check.checkManifest(m) });
}
for (const f of definitionFiles) {
    const def = readJson(f);
    results.push({ kind: 'definition', file: path.relative(process.cwd(), f), name: `${def.id}@${def.version}`, ...check.checkDefinition(def, manifests) });
}

const failed = results.filter((r) => !r.valid || (strict && r.warnings.length));
if (asJson) {
    process.stdout.write(JSON.stringify({ valid: failed.length === 0, strict, results }, null, 2) + '\n');
} else {
    for (const r of results) {
        const bad = !r.valid || (strict && r.warnings.length);
        console.log(`${bad ? 'FAIL' : 'ok  '} ${r.kind.padEnd(10)} ${r.name}${r.warnings.length ? `  (${r.warnings.length} warning${r.warnings.length > 1 ? 's' : ''})` : ''}`);
        for (const e of r.errors) console.log(`       error   [${e.layer}] ${e.path}: ${e.message}`);
        for (const w of r.warnings) console.log(`       warning [${w.layer}] ${w.path}: ${w.message}`);
    }
    const n = (k) => results.filter((r) => r.kind === k).length;
    console.log(`\n${n('manifest')} manifests, ${n('definition')} definitions: ${failed.length ? `${failed.length} failed` : 'all valid'}${strict ? ' (strict)' : ''}`);
}
process.exit(failed.length ? 1 : 0);
