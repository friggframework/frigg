/**
 * The JSON Schemas are the published contract; validate.js and manifests.js are what the runtime enforces. This keeps
 * them from drifting: every bundled example and manifest must pass both. ajv comes from the monorepo
 * (@friggframework/schemas depends on it); core itself stays dependency-free, so only this test needs it.
 */
const fs = require('fs');
const path = require('path');
const d = require('..');

let Ajv;
try { Ajv = require('ajv/dist/2020'); } catch {
    throw new Error('ajv is not installed: run npm install at the monorepo root (packages/schemas depends on ajv@8). This test fails rather than skips, so a missing check never reads as a pass.');
}
const ajv = new Ajv({ allErrors: true, strict: false });
const schema = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '../schema', name), 'utf8'));
const checkDefinition = ajv.compile(schema('integration-definition.v0.1.schema.json'));
const checkManifest = ajv.compile(schema('capability-manifest.v0.1.schema.json'));
const failures = (check, doc) => (check(doc) ? [] : check.errors.map((e) => `${e.instancePath} ${e.message}`));

describe('JSON Schemas', () => {
    it('every bundled example matches the definition schema', () => {
        for (const def of d.loadExamples()) expect([def.id, failures(checkDefinition, def)]).toEqual([def.id, []]);
    });

    it('every bundled manifest matches the manifest schema', () => {
        for (const [name, m] of Object.entries(d.loadManifests())) expect([name, failures(checkManifest, m)]).toEqual([name, []]);
    });

    it('the schema refuses what validate refuses: a row with both or neither of source and value, an unknown transform', () => {
        const def = d.loadExamples().find((x) => x.id === 'quo-hubspot');
        const bad = (f) => { const x = JSON.parse(JSON.stringify(def)); f(x); return failures(checkDefinition, x).length > 0; };
        expect(bad((x) => { x.syncs[0].mapping[0].value = 1; })).toBe(true);
        expect(bad((x) => { delete x.syncs[0].mapping[0].source; })).toBe(true);
        expect(bad((x) => { x.syncs[0].mapping[0].transform = 'shout'; })).toBe(true);
        expect(bad((x) => { x.syncs[0].mapping.push({ target: 'source', value: 'hubspot', direction: 'to_target' }); })).toBe(false);
    });

    it('the schema\'s transform list is the runtime\'s transform list', () => {
        const s = schema('integration-definition.v0.1.schema.json');
        expect(s.$defs.mappingRow.properties.transform.enum).toEqual(Object.keys(d.TRANSFORMS));
    });
});
