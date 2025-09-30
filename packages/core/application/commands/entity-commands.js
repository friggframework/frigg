const {
    createModuleRepository,
} = require('../../modules/repositories/module-repository-factory');

const ERROR_CODE_MAP = {
    ENTITY_NOT_FOUND: 404,
    INVALID_ENTITY_DATA: 400,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

/**
 * Create entity command factory
 *
 * NOTE: This is an internal API. Integration developers should use createFriggCommands() instead.
 *
 * @returns {Object} Entity command object with CRUD operations
 */
function createEntityCommands() {
    const moduleRepo = createModuleRepository();

    return {
        /**
         * Create a new entity
         * @param {Object} params
         * @param {string} params.userId - User ID who owns this entity
         * @param {string} params.externalId - External identifier from the API module
         * @param {string} params.name - Entity name
         * @param {string} params.moduleName - Module name (e.g., 'husbpot', 'frontify')
         * @param {string} [params.credentialId] - Associated credential ID
         * @returns {Promise<Object>} Created entity object
         */
        async createEntity({
            userId,
            externalId,
            name,
            moduleName,
            credentialId,
        } = {}) {
            try {
                if (!userId || !externalId || !moduleName) {
                    const error = new Error(
                        'userId, externalId, and moduleName are required'
                    );
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entityData = {
                    user: userId,
                    externalId,
                    name,
                    moduleName,
                };

                if (credentialId) {
                    entityData.credential = credentialId;
                }

                const entity = await moduleRepo.createEntity(entityData);

                return {
                    id: entity.id,
                    userId: entity.userId,
                    externalId: entity.externalId,
                    name: entity.name,
                    moduleName: entity.moduleName,
                    credentialId: entity.credential?._id
                        ? entity.credential._id.toString()
                        : entity.credential,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find an entity by filter criteria
         * @param {Object} filter
         * @param {string} [filter.externalId] - External ID to search for
         * @param {string} [filter.userId] - User ID to search for
         * @param {string} [filter.moduleName] - Module name to search for
         * @returns {Promise<Object|null>} Entity object or null if not found
         */
        async findEntity(filter = {}) {
            try {
                if (
                    !filter.externalId &&
                    !filter.userId &&
                    !filter.moduleName
                ) {
                    const error = new Error(
                        'At least one filter criterion is required'
                    );
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entity = await moduleRepo.findEntity(filter);

                if (!entity) {
                    return null;
                }

                return {
                    id: entity.id,
                    userId: entity.userId,
                    externalId: entity.externalId,
                    name: entity.name,
                    moduleName: entity.moduleName,
                    credentialId: entity.credential?._id
                        ? entity.credential._id.toString()
                        : entity.credential,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find all entities for a user
         * @param {string} userId - User ID to search for
         * @returns {Promise<Array>} Array of entity objects
         */
        async findEntitiesByUserId(userId) {
            try {
                if (!userId) {
                    const error = new Error('userId is required');
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entities = await moduleRepo.findEntitiesByUserId(userId);

                return entities.map((entity) => ({
                    id: entity.id,
                    userId: entity.userId,
                    externalId: entity.externalId,
                    name: entity.name,
                    moduleName: entity.moduleName,
                    credentialId: entity.credential?._id
                        ? entity.credential._id.toString()
                        : entity.credential,
                }));
            } catch (error) {
                if (error.code) {
                    return mapErrorToResponse(error);
                }
                // For find operations, return empty array on error instead of error object
                return [];
            }
        },

        /**
         * Find entities by user ID and module name
         * @param {string} userId - User ID to search for
         * @param {string} moduleName - Module name to filter by
         * @returns {Promise<Array>} Array of entity objects
         */
        async findEntitiesByUserIdAndModuleName(userId, moduleName) {
            try {
                if (!userId || !moduleName) {
                    const error = new Error(
                        'userId and moduleName are required'
                    );
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entities =
                    await moduleRepo.findEntitiesByUserIdAndModuleName(
                        userId,
                        moduleName
                    );

                return entities.map((entity) => ({
                    id: entity.id,
                    userId: entity.userId,
                    externalId: entity.externalId,
                    name: entity.name,
                    moduleName: entity.moduleName,
                    credentialId: entity.credential?._id
                        ? entity.credential._id.toString()
                        : entity.credential,
                }));
            } catch (error) {
                if (error.code) {
                    return mapErrorToResponse(error);
                }
                return [];
            }
        },

        /**
         * Find an entity by ID
         * @param {string} entityId - Entity ID to search for
         * @returns {Promise<Object>} Entity object
         */
        async findEntityById(entityId) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required');
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entity = await moduleRepo.findEntityById(entityId);

                return {
                    id: entity.id,
                    userId: entity.userId,
                    externalId: entity.externalId,
                    name: entity.name,
                    moduleName: entity.moduleName,
                    credentialId: entity.credential?._id
                        ? entity.credential._id.toString()
                        : entity.credential,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update an entity
         * @param {string} entityId - Entity ID to update
         * @param {Object} updates - Fields to update
         * @returns {Promise<Object>} Updated entity object
         */
        async updateEntity(entityId, updates) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required');
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const entity = await moduleRepo.updateEntity(entityId, updates);

                if (!entity) {
                    const error = new Error(`Entity ${entityId} not found`);
                    error.code = 'ENTITY_NOT_FOUND';
                    throw error;
                }

                return {
                    id: entity.id,
                    userId: entity.userId,
                    externalId: entity.externalId,
                    name: entity.name,
                    moduleName: entity.moduleName,
                    credentialId: entity.credential?._id
                        ? entity.credential._id.toString()
                        : entity.credential,
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Delete an entity
         * @param {string} entityId - Entity ID to delete
         * @returns {Promise<Object>} Result object with success flag
         */
        async deleteEntity(entityId) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required');
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                await moduleRepo.deleteEntity(entityId);

                return { success: true };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Remove credential reference from an entity
         * @param {string} entityId - Entity ID to update
         * @returns {Promise<Object>} Result object with success flag
         */
        async unsetCredential(entityId) {
            try {
                if (!entityId) {
                    const error = new Error('entityId is required');
                    error.code = 'INVALID_ENTITY_DATA';
                    throw error;
                }

                const acknowledged = await moduleRepo.unsetCredential(entityId);

                return { success: acknowledged };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },
    };
}

module.exports = {
    createEntityCommands,
    ERROR_CODE_MAP,
};
