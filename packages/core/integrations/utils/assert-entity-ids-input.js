/**
 * Throws INVALID_INTEGRATION_DATA unless an integration id and a non-empty
 * list of entity ids are given.
 * @param {string} integrationId
 * @param {string[]} entityIds
 */
function assertEntityIdsInput(integrationId, entityIds) {
    if (!integrationId || !Array.isArray(entityIds) || entityIds.length === 0) {
        const error = new Error(
            'integrationId and a non-empty entityIds array are required'
        );
        error.code = 'INVALID_INTEGRATION_DATA';
        throw error;
    }
}

function integrationNotFound(integrationId) {
    const error = new Error(`Integration ${integrationId} not found`);
    error.code = 'INTEGRATION_NOT_FOUND';
    return error;
}

/**
 * Loads an integration, mapping the repositories' "not found" error to
 * INTEGRATION_NOT_FOUND. Any other failure (connection, invalid id) is
 * rethrown unchanged.
 * @param {Object} integrationRepository
 * @param {string} integrationId
 * @returns {Promise<Object>} The integration record.
 */
async function loadIntegration(integrationRepository, integrationId) {
    try {
        return await integrationRepository.findIntegrationById(integrationId);
    } catch (error) {
        if (/^Integration with id .* not found$/.test(error?.message)) {
            throw integrationNotFound(integrationId);
        }
        throw error;
    }
}

module.exports = { assertEntityIdsInput, integrationNotFound, loadIntegration };
