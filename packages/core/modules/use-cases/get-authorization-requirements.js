const Boom = require('@hapi/boom');
const { findDefinition, getAuthStepCount } = require('./entity-types');

const defaultCreateModule = (params) => {
    const { Module } = require('../module');
    return new Module(params);
};

/**
 * Normalises what a module returns for a step into the v2 requirements
 * shape: `{ type, data }`. Modules either return `{ type, data }` already
 * (multi-step, JSON-schema forms) or a flat object such as the OAuth2
 * requester's `{ type: 'oauth2', url }`.
 */
function normalizeRequirements(raw) {
    if (!raw || typeof raw !== 'object') return { type: 'custom', data: {} };
    if (raw.data && typeof raw.data === 'object') {
        return { ...raw, type: raw.type || 'custom' };
    }
    const { type, ...data } = raw;
    return { type: type || 'custom', data };
}

/**
 * Single-step requirements, from wherever the module declares them: a
 * requiredAuthMethods.getAuthorizationRequirements(api) (the form-based
 * API-key convention `frigg auth` uses), or the Api's own
 * getAuthorizationRequirements() (OAuth2Requester builds the authorize URL).
 */
async function singleStepRequirements(definition, module) {
    const declared = definition.requiredAuthMethods?.getAuthorizationRequirements;
    if (typeof declared === 'function') return declared(module.api);
    if (typeof module.api?.getAuthorizationRequirements === 'function') {
        return module.api.getAuthorizationRequirements();
    }
    throw Boom.notImplemented(
        `Module ${definition.moduleName} declares no authorization requirements (add requiredAuthMethods.getAuthorizationRequirements)`,
        { code: 'REQUIREMENTS_NOT_DECLARED', expose: true }
    );
}

/**
 * What the caller must submit for one authorization step of an entity type
 * (Management API v2). Single-step modules use their Api's
 * getAuthorizationRequirements(); multi-step modules declare
 * getAuthStepCount() and getAuthRequirementsForStep(step) on their
 * definition (docs/MULTI_STEP_AUTH_MIGRATION_GUIDE.md).
 */
class GetAuthorizationRequirements {
    /**
     * @param {Object} params
     * @param {Array<Object>} params.moduleDefinitions
     * @param {Function} [params.createModule]
     */
    constructor({ moduleDefinitions, createModule }) {
        this.moduleDefinitions = moduleDefinitions || [];
        this.createModule = createModule || defaultCreateModule;
    }

    /**
     * @param {Object} params
     * @param {string} params.entityType
     * @param {number} [params.step=1]
     * @param {string} [params.userId]
     * @param {string} [params.state] - OAuth state forwarded to the Api.
     * @returns {Promise<{type: string, data: Object, step: number, totalSteps: number, isMultiStep: boolean}>}
     */
    async execute({ entityType, step = 1, userId = null, state } = {}) {
        const definition = findDefinition(this.moduleDefinitions, entityType);
        const totalSteps = getAuthStepCount(definition);

        if (!Number.isInteger(step) || step < 1 || step > totalSteps) {
            throw Boom.badRequest(
                `step must be between 1 and ${totalSteps} for ${entityType}`,
                { code: 'INVALID_STEP' }
            );
        }

        let raw;
        if (typeof definition.getAuthRequirementsForStep === 'function') {
            raw = await definition.getAuthRequirementsForStep(step);
        } else {
            const module = this.createModule({
                userId,
                definition,
                ...(state ? { state } : {}),
            });
            raw = await singleStepRequirements(definition, module);
        }

        return {
            ...normalizeRequirements(raw),
            step,
            totalSteps,
            isMultiStep: totalSteps > 1,
        };
    }
}

module.exports = { GetAuthorizationRequirements, normalizeRequirements };
