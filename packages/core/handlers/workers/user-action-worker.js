const { Worker } = require('../../core/Worker');
// Direct path (not the package index) avoids a circular require.
const { createHandler } = require('../../core/create-handler');
const {
    GetIntegrationInstance,
} = require('../../integrations/use-cases/get-integration-instance');
const { ModuleFactory } = require('../../modules/module-factory');
const {
    createIntegrationRepository,
} = require('../../integrations/repositories/integration-repository-factory');
const {
    createModuleRepository,
} = require('../../modules/repositories/module-repository-factory');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('../../integrations/utils/map-integration-dto');

/**
 * App-level worker for `dispatch: 'queue'` events. One Lambda serves every
 * integration; the FIFO queue serializes per integrationId. Re-hydrates by id +
 * owning user, then runs `instance.send(event, data)` (identical to the sync path).
 * Terminal failures discard; everything else retries → FIFO DLQ. DISABLED/ERROR
 * integrations are still processed (these are user-initiated mutations).
 */
class UserActionWorker extends Worker {
    constructor({ getIntegrationInstance } = {}) {
        super();
        this._getIntegrationInstance = getIntegrationInstance || null;
    }

    _validateParams(params) {
        this._verifyParamExists(params, 'event');
        this._verifyParamExists(params, 'data');
    }

    _resolveGetIntegrationInstance() {
        if (this._getIntegrationInstance) return this._getIntegrationInstance;

        const { loadAppDefinition } = require('../app-definition-loader');
        const { integrations: integrationClasses } = loadAppDefinition();
        const integrationRepository = createIntegrationRepository();
        const moduleRepository = createModuleRepository();
        const moduleFactory = new ModuleFactory({
            moduleRepository,
            moduleDefinitions:
                getModulesDefinitionFromIntegrationClasses(integrationClasses),
        });

        this._getIntegrationInstance = new GetIntegrationInstance({
            integrationRepository,
            integrationClasses,
            moduleFactory,
        });
        return this._getIntegrationInstance;
    }

    async _run(params) {
        const { event, data = {}, integrationId, userId, requestId } = params;
        const logCtx = { event, integrationId, userId, requestId };

        if (!integrationId || !userId) {
            const err = new Error(
                '[UserActionWorker] message missing integrationId/userId'
            );
            err.isHaltError = true;
            console.error(err.message, logCtx);
            throw err;
        }

        const getIntegrationInstance = this._resolveGetIntegrationInstance();

        let instance;
        try {
            instance = await getIntegrationInstance.execute(
                integrationId,
                userId
            );
        } catch (error) {
            // Only terminal failures discard; transient ones (DB/Prisma/KMS
            // blips) retry → FIFO DLQ rather than being silently dropped.
            if (error.isTerminal) {
                error.isHaltError = true;
                console.warn(
                    `[UserActionWorker] integration ${integrationId} gone/invalid — discarding`,
                    { ...logCtx, reason: error.message }
                );
            } else {
                console.error(
                    `[UserActionWorker] transient hydration failure for ${integrationId} — will retry`,
                    { ...logCtx, reason: error.message }
                );
            }
            throw error;
        }

        if (String(instance.id) !== String(integrationId)) {
            const err = new Error(
                `[UserActionWorker] hydrated id ${instance.id} != message integrationId ${integrationId}`
            );
            err.isHaltError = true;
            console.error(err.message, logCtx);
            throw err;
        }

        try {
            console.log(`[UserActionWorker] dispatching ${event}`, logCtx);
            const result = await instance.send(event, data);
            console.log(`[UserActionWorker] ${event} ok`, logCtx);
            return result;
        } catch (error) {
            try {
                await instance.updateIntegrationStatus.execute(
                    integrationId,
                    'ERROR'
                );
                await instance.updateIntegrationMessages.execute(
                    integrationId,
                    'warnings',
                    `Queued ${event} failed`,
                    error.message,
                    new Date().toISOString()
                );
            } catch (statusErr) {
                console.error(
                    '[UserActionWorker] failed to record error status/messages',
                    { ...logCtx, statusErr: statusErr.message }
                );
            }
            console.error(`[UserActionWorker] ${event} failed`, {
                ...logCtx,
                error: error.message,
            });
            throw error; // → SQS retry → FIFO DLQ
        }
    }
}

// createHandler gives the Lambda the standard worker setup (secretsToEnv,
// connectPrisma, callbackWaitsForEmptyEventLoop) and passes the result through.
const userActionQueueWorker = createHandler({
    eventName: 'UserActionQueueWorker',
    isUserFacingResponse: false,
    method: async (event, context) => new UserActionWorker().run(event, context),
});

module.exports = { UserActionWorker, userActionQueueWorker };
