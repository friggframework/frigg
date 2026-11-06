/**
 * Validate an app definition: the JSON Schema (keys, types, enums) plus the
 * semantic checks the schema cannot express (ADR-051). Pure: no I/O.
 */

const {
    validateAppDefinition,
    applyAppDefinitionDefaults,
    getSchema,
} = require('@friggframework/schemas');
const { schemaErrorsToIssues } = require('./schema-issues');
const { checkIntegrations } = require('./checks/integrations');
const { checkConfig } = require('./checks/config');

/**
 * @param {object} params
 * @param {object} params.definition the `Definition` exported by index.js
 * @param {string} [params.stage] the stage being built or deployed
 * @param {object} [params.env] environment variables (default process.env)
 * @returns {{ errors: object[], warnings: object[] }}
 */
function validateDefinition({ definition, stage, env = process.env }) {
    const schemaResult = validateAppDefinition(definition);
    // Integration entries are classes: checkIntegrations reports them more
    // precisely than the schema's view of them can.
    const issues = schemaErrorsToIssues(
        schemaResult.errors,
        getSchema('app-definition')
    ).filter((issue) => !issue.pointer.startsWith('/integrations/'));

    let semantic = [];
    if (definition && typeof definition === 'object') {
        semantic = [
            ...checkIntegrations(definition),
            ...checkConfig({
                definition: applyAppDefinitionDefaults(definition),
                raw: definition,
                stage,
                env,
            }),
        ];
    }

    // One issue per pointer and code; the schema's wins.
    const seen = new Set(issues.map((i) => `${i.code}:${i.pointer}`));
    for (const issue of semantic) {
        const key = `${issue.code}:${issue.pointer}`;
        if (!seen.has(key)) {
            seen.add(key);
            issues.push(issue);
        }
    }

    return {
        errors: issues.filter((i) => i.severity === 'error'),
        warnings: issues.filter((i) => i.severity !== 'error'),
    };
}

module.exports = { validateDefinition };
