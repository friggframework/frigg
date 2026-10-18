/**
 * The JSON Schemas are the published contract; validate.js and manifests.js are what the runtime enforces. Every
 * bundled example and manifest must pass both layers, through the same schema-check.js the CLI uses. ajv comes from
 * the monorepo (@friggframework/schemas depends on it); if it is missing this file fails, it never skips.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');
const d = require('..');
const { checkDefinition, checkManifest, loadAjv } = require('../schema-check');

loadAjv(); // throws "ajv is not installed ..." so a missing check never reads as a pass

const manifests = d.loadManifests();
const failures = (r) => r.errors.map((e) => `[${e.layer}] ${e.path} ${e.message}`);

describe('both validation layers', () => {
    it('every bundled manifest passes', () => {
        for (const [name, m] of Object.entries(manifests)) expect([name, failures(checkManifest(m))]).toEqual([name, []]);
    });

    it('every bundled example passes', () => {
        for (const def of d.loadExamples()) expect([def.id, failures(checkDefinition(def, manifests))]).toEqual([def.id, []]);
    });

    it('the schema refuses what validate refuses, and each layer reports it under its own name', () => {
        const def = JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === 'quo-hubspot')));
        def.syncs[0].mapping[0].transform = 'shout';
        const layers = checkDefinition(def, manifests).errors.map((e) => e.layer);
        expect(layers).toEqual(['schema', 'references']);
        const ok = JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === 'quo-hubspot')));
        ok.syncs[0].mapping.push({ target: 'source', value: 'hubspot', direction: 'to_target' });
        expect(checkDefinition(ok, manifests).valid).toBe(true);
    });

    it('the schema\'s transform list is the runtime\'s transform list', () => {
        const s = JSON.parse(fs.readFileSync(path.join(__dirname, '../schema/integration-definition.v0.1.schema.json'), 'utf8'));
        expect(s.$defs.mappingRow.properties.transform.enum).toEqual(Object.keys(d.TRANSFORMS));
    });

    it('the generated installation record matches the installation schema', () => {
        const rec = JSON.parse(fs.readFileSync(path.join(__dirname, '../examples/records/quo-hubspot.integration.json'), 'utf8'));
        expect(failures(require('../schema-check').checkInstallation(rec.config))).toEqual([]);
    });
});

describe('scripts/validate.js (the real CLI, as a child process)', () => {
    const cli = path.join(__dirname, '../scripts/validate.js');
    const runCli = (...args) => {
        try { return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: process.env }) }; } catch (e) { return { code: e.status, out: `${e.stdout}${e.stderr}` }; }
    };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-validate-'));
    const write = (name, doc) => { const f = path.join(tmp, name); fs.writeFileSync(f, typeof doc === 'string' ? doc : JSON.stringify(doc)); return f; };
    const quo = () => JSON.parse(JSON.stringify(require('../examples/quo-hubspot.definition.json')));

    it('exits 0 on every bundled manifest and example', () => {
        const r = runCli();
        expect(r.code).toBe(0);
        expect(r.out).toMatch(/21 manifests, 16 definitions: all valid/);
    });

    it('exits 1 on an invalid definition and names the layer, path and reason', () => {
        const bad = quo(); bad.workflows[0].steps[0].use = 'hubspot.nope.make';
        const r = runCli(write('bad.json', bad));
        expect(r.code).toBe(1);
        expect(r.out).toMatch(/error\s+\[references\] workflows\[0\]\.steps\[0\]\.use: Module "hubspot" \(hubspot\) has no capability "nope\.make"/);
    });

    it('a warning passes, unless --strict', () => {
        const w = quo(); w.templates.orphan = 'x';
        const f = write('warn.json', w);
        expect(runCli(f).code).toBe(0);
        expect(runCli('--strict', f).code).toBe(1);
    });

    it('exits 2 when it cannot run: unreadable JSON, a missing file, an unknown option', () => {
        expect(runCli(write('junk.json', '{nope')).code).toBe(2);
        expect(runCli(path.join(tmp, 'missing.json')).code).toBe(2);
        expect(runCli('--bogus').code).toBe(2);
    });

    it('an invalid manifest fails the run even when every definition passes', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-manifests-'));
        for (const [name, m] of Object.entries(manifests)) fs.writeFileSync(path.join(dir, `${name}.capabilities.json`), JSON.stringify(m));
        const hs = JSON.parse(JSON.stringify(manifests.hubspot)); hs.options.owner.capability = 'deal.update';
        fs.writeFileSync(path.join(dir, 'hubspot.capabilities.json'), JSON.stringify(hs));
        const r = runCli('--manifests', dir, path.join(__dirname, '../examples/pipedrive-hubspot.definition.json'));
        expect(r.code).toBe(1);
        expect(r.out).toMatch(/FAIL manifest\s+hubspot/);
    });
});
