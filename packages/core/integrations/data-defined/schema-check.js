/**
 * Two layers of validation, run together everywhere (the CLI, the tests, anything that publishes):
 *   1. JSON Schema (schema/*.schema.json) — the published shape. Needs ajv, which the monorepo installs for
 *      @friggframework/schemas; core's runtime stays dependency-free, so ajv is loaded only here.
 *   2. References (validate.js / manifests.js) — what a schema cannot see: steps name declared capabilities,
 *      $.steps.x is an earlier step, view paths exist, option inputs are declared, and so on.
 * A document is valid only when both pass.
 */
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate');
const { validateManifest } = require('./manifests');

const SCHEMA_DIR = path.join(__dirname, 'schema');
let compiled;

function loadAjv() {
    try { return require('ajv/dist/2020'); } catch {
        const e = new Error('ajv is not installed. Run npm install at the monorepo root (@friggframework/schemas depends on ajv@8).');
        e.code = 'NO_AJV';
        throw e;
    }
}

function schemas() {
    if (compiled) return compiled;
    const Ajv = loadAjv();
    const ajv = new Ajv({ allErrors: true, strict: false });
    const read = (f) => JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8'));
    compiled = {
        definition: ajv.compile(read('integration-definition.v0.1.schema.json')),
        manifest: ajv.compile(read('capability-manifest.v0.1.schema.json')),
        installation: ajv.compile(read('installation.v0.1.schema.json')),
    };
    return compiled;
}

const schemaErrors = (check, doc) => (check(doc) ? [] : check.errors.map((e) => ({ layer: 'schema', path: e.instancePath.replace(/^\//, '').replace(/\//g, '.') || '(root)', message: e.message + (e.params?.allowedValues ? ` (${e.params.allowedValues.join(', ')})` : e.params?.additionalProperty ? ` ("${e.params.additionalProperty}")` : '') })));

/** @returns {{ valid: boolean, errors: Array<{layer,path,message}>, warnings: Array<{layer,path,message}> }} */
function checkManifest(manifest) {
    const errors = [...schemaErrors(schemas().manifest, manifest), ...validateManifest(manifest).errors.map((e) => ({ layer: 'references', ...e }))];
    return { valid: errors.length === 0, errors, warnings: [] };
}

/** A definition against the manifests of the modules it uses. Both layers run even when the first fails. */
function checkDefinition(def, manifests) {
    const v = validate(def, manifests);
    const errors = [...schemaErrors(schemas().definition, def), ...v.errors.map((e) => ({ layer: 'references', ...e }))];
    return { valid: errors.length === 0, errors, warnings: v.warnings.map((w) => ({ layer: 'references', ...w })) };
}

function checkInstallation(config) {
    const errors = schemaErrors(schemas().installation, config);
    return { valid: errors.length === 0, errors, warnings: [] };
}

module.exports = { checkDefinition, checkManifest, checkInstallation, loadAjv };
