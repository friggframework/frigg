/**
 * Validate an API module Definition: the JSON Schema plus the structural
 * checks `checkModuleDefinition` runs for modules listed on an app
 * (ADR-051). Pure: no I/O.
 */

const {
    validateApiModuleDefinition,
    getSchema,
} = require('@friggframework/schemas');
const { schemaErrorsToIssues } = require('./schema-issues');
const { checkModuleDefinition } = require('./checks/integrations');

/**
 * @param {object} params
 * @param {object} params.definition the `Definition` exported by the module
 * @returns {{ errors: object[], warnings: object[] }}
 */
function validateModuleDefinition({ definition }) {
    const schemaResult = validateApiModuleDefinition(definition);
    const issues = schemaErrorsToIssues(
        schemaResult.errors,
        getSchema('api-module-definition')
    );

    const structural =
        definition && typeof definition === 'object'
            ? checkModuleDefinition(definition, '')
            : [];

    const seen = new Set(issues.map((i) => `${i.code}:${i.pointer}`));
    for (const issue of structural) {
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

module.exports = { validateModuleDefinition };
