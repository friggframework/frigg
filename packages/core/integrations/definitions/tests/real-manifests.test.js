/**
 * Real manifests (ADR-063 phase 4): a capability names a method that really exists on the module's Api, called the
 * way the method takes its arguments. Covers `args` (positional calls), `status: "unimplemented"` (a warning in the
 * definition, never an error) and scripts/check-manifests.js against a small fake module directory.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const d = require('..');
const { argumentsFor, makePorts } = require('../runtime');
const { validateManifest } = require('../manifests');
const { checkManifests, summarise, parametersOf } = require('../scripts/check-manifests');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));
const clone = (x) => JSON.parse(JSON.stringify(x));
const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-manifests.js');

describe('args: how the Api method takes its arguments', () => {
    it('no args: one object of every input; args: positional, "$rest" and constants', () => {
        const input = { id: '7', fields: { a: 1 }, extra: true };
        expect(argumentsFor(input, undefined)).toEqual([input]);
        expect(argumentsFor(input, ['id'])).toEqual(['7']);
        expect(argumentsFor(input, [{ value: 'Lead' }, 'id', 'fields'])).toEqual(['Lead', '7', { a: 1 }]);
        expect(argumentsFor(input, ['id', '$rest'])).toEqual(['7', { fields: { a: 1 }, extra: true }]);
        expect(argumentsFor({}, ['id'])).toEqual([undefined]);
    });

    it('a capability call reaches the Api positionally when the manifest says so', async () => {
        const def = example('phone-hubspot');
        const seen = [];
        const ports = makePorts({ def, manifests, store: { get: async () => null, put: async () => {}, claim: async () => true }, callApi: async (module, method, args, order) => { seen.push([module, method, argumentsFor(args, order)]); return {}; } });
        await ports.call('hubspot', 'contact.update', { id: '9', properties: { firstname: 'Ada' } });
        await ports.call('phone', 'contact.update', { id: 'CT1', defaultFields: { firstName: 'Ada' } });
        await ports.call('hubspot', 'contact.list', { limit: 5 });
        expect(seen).toEqual([
            ['hubspot', 'updateContact', ['9', { firstname: 'Ada' }]],
            ['phone', 'updateContact', ['CT1', { defaultFields: { firstName: 'Ada' } }]],
            ['hubspot', 'listContacts', [{ limit: 5 }]],
        ]);
    });

    const base = () => ({ module: 'm', label: 'M', capabilities: { 'a.get': { kind: 'read', method: 'getA', input: { id: { type: 'string' }, fields: { type: 'object' } } } } });
    const errs = (m) => validateManifest(m).errors.map((e) => `${e.path}: ${e.message}`).join('\n');

    it('the manifest check refuses an args list that names no input, repeats one, or leaves one unpassed', () => {
        const m = base();
        m.capabilities['a.get'].args = ['id', 'fields'];
        expect(errs(m)).toBe('');
        m.capabilities['a.get'].args = ['id', 'nope'];
        expect(errs(m)).toMatch(/args\[1\]: "nope" is not an input/);
        m.capabilities['a.get'].args = ['id', 'id'];
        expect(errs(m)).toMatch(/"id" is passed twice/);
        // An input no argument carries is accepted by the validator and silently dropped by the call.
        m.capabilities['a.get'].args = ['id'];
        expect(errs(m)).toMatch(/Input "fields" is declared but never passed to getA/);
        m.capabilities['a.get'].args = ['id', '$rest'];
        expect(errs(m)).toBe('');
        m.capabilities['a.get'].args = [{ value: 'Lead' }, 'id', 'fields'];
        expect(errs(m)).toBe('');
        m.capabilities['a.get'].args = [{ oops: 1 }, 'id', 'fields'];
        expect(errs(m)).toMatch(/An input name, "\$rest" or \{ value \}/);
        m.capabilities['a.get'].args = 'id';
        expect(errs(m)).toMatch(/An ordered list/);
    });

    it('the schema accepts args, status and note, and rejects an args entry that is neither a name nor { value }', () => {
        const check = require('../schema-check');
        try { check.loadAjv(); } catch { return; } // ajv is installed at the monorepo root only
        const m = { ...base(), package: '@x/api-module-m', objects: {} };
        Object.assign(m.capabilities['a.get'], { args: ['id', '$rest'], status: 'unimplemented', note: 'why' });
        expect(check.checkManifest(m).errors).toEqual([]);
        m.capabilities['a.get'].args = [7];
        expect(check.checkManifest(m).errors.map((e) => e.layer)).toContain('schema');
        m.capabilities['a.get'].args = ['id', '$rest'];
        m.capabilities['a.get'].status = 'broken';
        expect(check.checkManifest(m).valid).toBe(false);
    });

    it('status accepts only "unimplemented"', () => {
        const m = base();
        m.capabilities['a.get'].status = 'unimplemented';
        expect(errs(m)).toBe('');
        m.capabilities['a.get'].status = 'later';
        expect(errs(m)).toMatch(/status: Only "unimplemented"/);
        m.capabilities['a.get'].status = undefined;
        m.webhook = { scope: 'app', topic: '{{body.t}}', eventId: '{{body.id}}', status: 'soon' };
        expect(errs(m)).toMatch(/webhook\.status/);
    });
});

describe('unimplemented capabilities are a warning in the definition, never an error', () => {
    const warningsOf = (def) => d.validate(def, manifests).warnings.map((w) => `${w.path}: ${w.message}`);
    const errorsOf = (def) => d.validate(def, manifests).errors;

    it('a step on an unimplemented capability warns, naming the capability and why', () => {
        // Phone has no contact search; every HubSpot capability now has a method (api-module-library #106).
        const def = example('phone-hubspot');
        def.workflows[0].steps.unshift({ id: 'find', use: 'phone.contact.search', with: { email: 'a@b.co' } });
        expect(errorsOf(def)).toEqual([]);
        expect(warningsOf(def).join('\n')).toMatch(/steps\[0\]\.use: phone\.contact\.search is unimplemented in the phone Api \(Api has no contact search/);
    });

    it('an implemented capability does not', () => {
        const def = example('phone-hubspot');
        def.workflows[0].steps.unshift({ id: 'get', use: 'hubspot.contact.get', with: { id: '1' } });
        expect(warningsOf(def).filter((w) => w.includes('workflows[0].steps[0]'))).toEqual([]);
    });

    it('an option list and a sync that read through one warn too', () => {
        // The bundled manifests only leave Phone's contact.search unimplemented now, so the other two shapes are checked
        // against a copy in which HubSpot's owner.list and Linear's issue.create are marked unimplemented.
        const all = d.loadExamples().flatMap((def) => warningsOf(def)).join('\n');
        expect(all).toMatch(/phone\.contact syncs through contact\.search, which is unimplemented in the phone Api/);
        const marked = clone(manifests);
        for (const [mod, cap] of [['hubspot', 'owner.list'], ['linear', 'issue.create']]) {
            marked[mod].capabilities[cap].status = 'unimplemented';
            marked[mod].capabilities[cap].note = `Api has no ${cap}.`;
        }
        const warnsMarked = (def) => d.validate(def, marked).warnings.map((w) => `${w.path}: ${w.message}`);
        expect(d.loadExamples().flatMap(warnsMarked).join('\n')).toMatch(/Option list hubspot\.owner reads owner\.list, which is unimplemented in the hubspot Api/);
        const sync = example('github-linear');
        expect(warnsMarked(sync).join('\n')).toMatch(/linear\.issue syncs through issue\.create, which is unimplemented in the linear Api/);
        expect(d.validate(sync, marked).errors).toEqual([]);
    });

    it('a trigger on a module whose webhook verification is unimplemented warns once per trigger', () => {
        const def = example('phone-hubspot');
        // Mark HubSpot's verification unimplemented in a copy: the bundled manifests now verify (api-module-library).
        const unverified = clone(manifests);
        unverified.hubspot.webhook.status = 'unimplemented';
        unverified.hubspot.webhook.note = 'The hubspot Api has no verifyWebhookSignature method; webhook signatures cannot be checked.';
        const w = d.validate(def, unverified).warnings.map((x) => x.message).filter((x) => /fail(s)? signature verification/.test(x));
        expect(w.length).toBeGreaterThan(0);
        expect(w[0]).toMatch(/verifyWebhookSignature method, so every delivery fails signature verification/);
        // The bundled manifests verify both modules: no such warning.
        expect(d.validate(def, manifests).warnings.filter((x) => /signature verification/.test(x.message))).toEqual([]);
        // Salesforce has no signed webhook and stays unimplemented, so a delivery there is rejected, never accepted.
        expect(manifests.salesforce.webhook.status).toBe('unimplemented');
    });

    it('every bundled manifest validates, and every unimplemented one says why', () => {
        for (const m of Object.values(manifests)) {
            expect([m.module, validateManifest(m).errors]).toEqual([m.module, []]);
            for (const [name, c] of Object.entries(m.capabilities)) if (c.status) expect([m.module, name, typeof c.note, c.note?.length > 10]).toEqual([m.module, name, 'string', true]);
        }
    });
});

describe('scripts/check-manifests.js against a fake module directory', () => {
    let root;
    const write = (rel, text) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    const manifest = (extra = {}) => ({
        module: 'widget', label: 'Widget', package: '@x/api-module-widget',
        webhook: { scope: 'app', topic: '{{body.t}}', eventId: '{{body.id}}', verify: 'verifySig', account: '{{body.a}}', ...extra.webhook },
        capabilities: {
            'thing.get': { kind: 'read', method: 'getThing', args: ['id'], input: { id: { type: 'string', required: true } } },
            'thing.list': { kind: 'read', method: 'listThings', input: { limit: { type: 'number' } } },
            'thing.update': { kind: 'write', method: 'updateThing', args: ['id', '$rest'], input: { id: { type: 'string' }, name: { type: 'string' } } },
            'thing.gone': { kind: 'read', method: 'noSuchMethod', input: {} },
            'thing.later': { kind: 'read', method: 'laterMethod', status: 'unimplemented', note: 'Not written yet', input: {} },
            'thing.stale': { kind: 'read', method: 'listThings', status: 'unimplemented', note: 'Marked, but it exists', input: {} },
            'thing.two': { kind: 'read', method: 'getPair', input: { a: { type: 'string' } } },
            'thing.long': { kind: 'read', method: 'getThing', args: ['id', 'extra', 'more'], input: { id: { type: 'string' }, extra: { type: 'string' }, more: { type: 'string' } } },
            ...extra.capabilities,
        },
    });
    const API = `
class Base { listThings(params = {}) { return params; } }
class Api extends Base {
    async getThing(id) { return id; }
    async updateThing(id, body) { return [id, body]; }
    async getPair(a, b) { return [a, b]; }
    verifySig(headers, body) { return true; }
}
module.exports = { Api };
`;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-manifests-'));
        write('mods/group/api-module-widget/package.json', '{"name":"@x/api-module-widget"}');
        write('mods/group/api-module-widget/index.js', API);
        write('manifests/widget.capabilities.json', JSON.stringify(manifest()));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    const rowsOf = (results, mod = 'widget') => Object.fromEntries(results.find((r) => r.module === mod).rows.map((r) => [r.capability, r]));
    const load = () => JSON.parse(fs.readFileSync(path.join(root, 'manifests', 'widget.capabilities.json'), 'utf8'));

    it('finds the module under a nested directory, and a method inherited from a base class', () => {
        const [r] = checkManifests({ widget: load() }, [path.join(root, 'mods')]);
        expect(r.source).toBe(path.join(root, 'mods', 'group', 'api-module-widget'));
        const rows = rowsOf([r]);
        expect(rows['thing.get']).toMatchObject({ state: 'ok', signature: '(id)', args: 'id' });
        expect(rows['thing.list']).toMatchObject({ state: 'ok', signature: '(params = {})' });
        expect(rows['thing.update']).toMatchObject({ state: 'ok', args: 'id, $rest' });
        expect(rows['webhook.verify']).toMatchObject({ state: 'ok', signature: '(headers, body)' });
    });

    it('reports a missing method, a marked-but-present one, and an unimplemented one that is absent', () => {
        const rows = rowsOf(checkManifests({ widget: load() }, [path.join(root, 'mods')]));
        expect(rows['thing.gone']).toMatchObject({ state: 'missing', method: 'noSuchMethod' });
        expect(rows['thing.later']).toMatchObject({ state: 'unimplemented', note: 'Not written yet' });
        expect(rows['thing.stale']).toMatchObject({ state: 'stale-unimplemented' });
        expect(rows['thing.stale'].note).toMatch(/Marked unimplemented, but listThings\(params = \{\}\) exists: Marked, but it exists/);
    });

    it('reports arguments that do not fit: more passed than declared, or one object for a method that needs two', () => {
        const rows = rowsOf(checkManifests({ widget: load() }, [path.join(root, 'mods')]));
        expect(rows['thing.long']).toMatchObject({ state: 'arity', note: 'Passes 3 arguments; getThing declares 1' });
        expect(rows['thing.two']).toMatchObject({ state: 'arity' });
        expect(rows['thing.two'].note).toMatch(/needs 2 positional arguments \(add args\)/);
    });

    it('checks webhook.verify: a missing method fails, an unimplemented one is soft', () => {
        const m = load();
        m.webhook.verify = 'noVerify';
        expect(rowsOf(checkManifests({ widget: m }, [path.join(root, 'mods')]))['webhook.verify']).toMatchObject({ state: 'missing' });
        m.webhook.status = 'unimplemented';
        expect(rowsOf(checkManifests({ widget: m }, [path.join(root, 'mods')]))['webhook.verify']).toMatchObject({ state: 'unimplemented' });
        m.webhook.verify = 'verifySig';
        expect(rowsOf(checkManifests({ widget: m }, [path.join(root, 'mods')]))['webhook.verify']).toMatchObject({ state: 'stale-unimplemented' });
    });

    it('a module that is not there, and one that will not load, are reported, not thrown', () => {
        const other = { ...load(), module: 'ghost' };
        write('mods/boom/package.json', '{"name":"@x/api-module-boom"}');
        write('mods/boom/index.js', "throw new Error('Cannot start: missing dependency');");
        const boom = { ...load(), module: 'boom' };
        const results = checkManifests({ ghost: other, boom }, [path.join(root, 'mods')]);
        expect(results.find((r) => r.module === 'ghost')).toMatchObject({ state: 'no-module', rows: [] });
        const b = results.find((r) => r.module === 'boom');
        expect(b.state).toBe('unloadable');
        expect(b.message).toMatch(/Cannot start: missing dependency/);
    });

    it('summarise counts mismatches apart from what is only unverified', () => {
        const results = checkManifests({ widget: load(), ghost: { ...load(), module: 'ghost' } }, [path.join(root, 'mods')]);
        const s = summarise(results);
        expect(s.mismatches).toBe(3); // thing.gone, thing.two, thing.long
        expect(s.soft).toBe(3); // thing.later, thing.stale, ghost
    });

    it('parametersOf reads defaults, rests and destructuring', () => {
        expect(parametersOf(function a(x, { y, z }, w = 1, ...rest) {}).map((p) => p.optional)).toEqual([false, false, true, true]);
        expect(parametersOf((a) => a)).toHaveLength(1);
        expect(parametersOf((a) => a)[0]).toMatchObject({ text: 'a', optional: false });
        expect(parametersOf(new Function('x', 'return x'))).toHaveLength(1);
        expect(parametersOf(function none() {})).toEqual([]);
    });

    describe('command line', () => {
        const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
        const mods = () => path.join(root, 'mods');
        const mdir = () => path.join(root, 'manifests');

        it('exits 1 on a mismatch and names it', () => {
            const r = run('--manifests', mdir(), mods());
            expect(r.status).toBe(1);
            expect(r.stdout).toMatch(/FAIL widget/);
            expect(r.stdout).toMatch(/missing\s+thing\.gone -> noSuchMethod/);
        });

        it('exits 0 when every method is found, and 1 under --strict while any capability is unimplemented', () => {
            const m = load();
            for (const k of ['thing.gone', 'thing.two', 'thing.long', 'thing.stale']) delete m.capabilities[k];
            fs.writeFileSync(path.join(mdir(), 'widget.capabilities.json'), JSON.stringify(m));
            expect(run('--manifests', mdir(), mods()).status).toBe(0);
            expect(run('--strict', '--manifests', mdir(), mods()).status).toBe(1);
            delete m.capabilities['thing.later'];
            fs.writeFileSync(path.join(mdir(), 'widget.capabilities.json'), JSON.stringify(m));
            const clean = run('--strict', '--json', '--manifests', mdir(), mods());
            expect(clean.status).toBe(0);
            expect(JSON.parse(clean.stdout)).toMatchObject({ valid: true, summary: { mismatches: 0, soft: 0 } });
        });

        it('--json is machine-readable', () => {
            const out = JSON.parse(run('--json', '--manifests', mdir(), mods()).stdout);
            expect(out.valid).toBe(false);
            expect(out.results[0].rows.find((x) => x.capability === 'thing.gone').state).toBe('missing');
        });

        it('exits 2 when it cannot run: no directory, an unknown option, no manifests', () => {
            expect(run().status).toBe(2);
            expect(run('--manifests', mdir(), path.join(root, 'nowhere')).status).toBe(2);
            expect(run('--bogus', mods()).status).toBe(2);
            fs.mkdirSync(path.join(root, 'empty'));
            expect(run('--manifests', path.join(root, 'empty'), mods()).status).toBe(2);
        });

        it('--stub-missing loads a module whose dependency is not installed; without it the module is unloadable', () => {
            write('mods/needs/package.json', '{"name":"@x/api-module-needs"}');
            write('mods/needs/index.js', "const sdk = require('not-installed-sdk'); class Api { getThing(id) { return sdk.x(id); } } module.exports = { Api };");
            const m = { module: 'needs', label: 'N', capabilities: { 'thing.get': { kind: 'read', method: 'getThing', args: ['id'], input: { id: { type: 'string' } } } } };
            fs.writeFileSync(path.join(mdir(), 'needs.capabilities.json'), JSON.stringify(m));
            const plain = JSON.parse(run('--json', '--manifests', mdir(), mods()).stdout).results.find((r) => r.module === 'needs');
            expect(plain.state).toBe('unloadable');
            const stubbed = JSON.parse(run('--json', '--stub-missing', '--manifests', mdir(), mods()).stdout).results.find((r) => r.module === 'needs');
            expect(stubbed).toMatchObject({ state: 'ok' });
            expect(stubbed.rows[0]).toMatchObject({ capability: 'thing.get', state: 'ok' });
        });
    });
});
