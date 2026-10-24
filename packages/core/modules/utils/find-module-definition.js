/**
 * The API module definition a stored entity belongs to.
 *
 * Entities are persisted with `moduleName` set to the definition's
 * `moduleName` (see ProcessAuthorizationCallback.findOrCreateEntity). A
 * definition's legacy `modelName` is accepted as well, for entities written
 * before the two were the same.
 *
 * @param {Array<Object>} moduleDefinitions
 * @param {Object} entity - entity record with a `moduleName`
 * @returns {Object|undefined}
 */
function findModuleDefinitionForEntity(moduleDefinitions, entity) {
    const entityType = entity?.moduleName;
    if (!entityType) return undefined;
    return (moduleDefinitions || []).find(
        (def) =>
            def &&
            (def.moduleName === entityType || def.modelName === entityType)
    );
}

module.exports = { findModuleDefinitionForEntity };
