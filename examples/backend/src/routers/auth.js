const express = require('express');
const RouterUtil = require('../utils/RouterUtil');
const EntityManager = require('../managers/entities/EntityManager');
const IntegrationConfigManager = require('../managers/IntegrationConfigManager');
const { requireLoggedInUser } = require('./middleware/requireLoggedInUser');
const IntegrationManager = require('../managers/integrations/IntegrationManager');
const GeneralUtil = require('../utils/GeneralUtil');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const { debug } = require('../utils/logger');

// Check the entity type is valid, and get an instance for the current user.
const getEntityFromType = async (req, entityType) => {
    if (!EntityManager.checkIsValidType(entityType)) {
        throw Boom.badRequest(
            `Error: Invalid entity type of ${entityType}, options are ${EntityManager.entityTypes.join(
                ', '
            )}`
        );
    }

    const EntityManagerClass = EntityManager.getEntityManagerClass(entityType);
    return await EntityManagerClass.getInstance({
        userId: req.userManager.getUserId(),
    });
};

const router = express();

router.all('/api/integrations*', requireLoggedInUser);
router.all('/api/entities*', requireLoggedInUser);
router.all('/api/authorize', requireLoggedInUser);

router.route('/api/integrations').get(
    catchAsyncError(async (req, res) => {
        const configManager = new IntegrationConfigManager();
        const results = await configManager.getIntegrationOptions();

        // get the list of entities
        const entities = await EntityManager.getEntitiesForUser(
            req.userManager.getUserId()
        );
        results.entities.authorized = entities;

        // get the list of integrations
        results.integrations =
            await IntegrationManager.getIntegrationsForUserId(
                req.userManager.getUserId()
            );

        res.json(results);
    })
);

// Return the entityManager authorization requirements
router.route('/api/authorize').get(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.query, [
            'entityType',
            'connectingEntityType',
        ]);
        const instance = await getEntityFromType(req, params.entityType);

        const areRequirementsValid =
            instance.validateAuthorizationRequirements();
        if (!areRequirementsValid) {
            throw new Error(
                `Error: EntityManager of type ${params.entityType} requires a valid url`
            );
        }

        res.json(await instance.getAuthorizationRequirements());
    })
);

// Return the entityManager authorization results
router.route('/api/authorize').post(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.body, [
            'entityType',
            'data',
        ]);
        const instance = await getEntityFromType(req, params.entityType);
        const results = await instance.processAuthorizationCallback({
            userId: req.userManager.getUserId(),
            data: params.data,
        });

        res.json(results);
    })
);

router.route('/api/entity/options/:credentialId').get(
    catchAsyncError(async (req, res) => {
        // TODO May want to pass along the user ID as well so credential ID's can't be fished???
        const credential = await IntegrationManager.getCredentialById(
            req.params.credentialId
        );
        if (credential.user._id.toString() !== req.userManager.getUserId()) {
            throw Boom.forbidden('Credential does not belong to user');
        }

        const params = RouterUtil.checkRequiredParams(req.query, [
            'entityType',
        ]);
        const instance = await getEntityFromType(req, params.entityType);

        res.json(await instance.getEntityOptions());
    })
);

router.route('/api/entity').post(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.body, [
            'entityType',
            'data',
        ]);
        RouterUtil.checkRequiredParams(req.body.data, ['credential_id']);

        // May want to pass along the user ID as well so credential ID's can't be fished???
        const credential = await IntegrationManager.getCredentialById(
            params.data.credential_id
        );

        if (!credential) {
            throw Boom.badRequest('Invalid credential ID');
        }

        const instance = await getEntityFromType(req, params.entityType);
        res.json(await instance.findOrCreateEntity(params.data));
    })
);

router.route('/api/integrations').post(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.body, [
            'entities',
            'config',
        ]);
        GeneralUtil.getParam(params.config, 'type');

        // verify entity size
        if (params.entities.length !== 2) {
            throw Boom.badRequest(
                'entities array should have only two entities'
            );
        }

        // create integration
        const integrationManagerInstance =
            await IntegrationManager.createIntegration(
                params.entities,
                req.userManager.getUserId(),
                params.config
            );

        // post integration initialization
        debug(
            `Calling processCreate on the ${integrationManagerInstance?.constructor?.Config?.name} Manager with no arguments`
        );
        await integrationManagerInstance.processCreate();

        // filtered set for results
        const { integration } = integrationManagerInstance;
        const response = await IntegrationManager.getFormattedIntegration(
            integration
        );
        res.status(201);
        res.json(response);
    })
);

router.route('/api/integrations/:integrationId').patch(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.body, ['config']);

        const integrationManagerInstance =
            await IntegrationManager.getInstanceFromIntegrationId({
                integrationId: params.integrationId,
                userId: req.userManager.getUserId(),
            });

        debug(
            `Calling processUpdate on the ${integrationManagerInstance?.constructor?.Config?.name} Manager arguments: `,
            params
        );
        await integrationManagerInstance.processUpdate(params);

        const response = await IntegrationManager.getFormattedIntegration(
            integrationManagerInstance.integration
        );

        res.json(response);
    })
);

router.route('/api/integrations/:integrationId').delete(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.params, [
            'integrationId',
        ]);
        const integrationManagerInstance =
            await IntegrationManager.getInstanceFromIntegrationId({
                userId: req.userManager.getUserId(),
                integrationId: params.integrationId,
            });

        debug(
            `Calling processUpdate on the ${integrationManagerInstance?.constructor?.Config?.name} Manager with no arguments`
        );
        await integrationManagerInstance.processDelete();
        await IntegrationManager.deleteIntegrationForUserById(
            req.userManager.getUserId(),
            params.integrationId
        );

        res.status(201);
        res.json({});
    })
);

router.route('/api/integrations/:integrationId/config/options').get(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.params, [
            'integrationId',
        ]);
        const integrationManagerInstance =
            await IntegrationManager.getInstanceFromIntegrationId(params);
        const results = await integrationManagerInstance.getConfigOptions();
        // We could perhaps augment this with dynamic options? Haven't decided yet, but here may be the place
        res.json(results);
    })
);

router.route('/api/integrations/:integrationId').get(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.params, [
            'integrationId',
        ]);
        const integration = await IntegrationManager.getIntegrationById(
            params.integrationId
        );
        // We could perhaps augment this with dynamic options? Haven't decided yet, but here may be the place

        res.json({
            id: integration.id,
            entities: integration.entities,
            status: integration.status,
            config: integration.config,
        });
    })
);

router.route('/api/integrations/:integrationId/test-auth').get(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.params, [
            'integrationId',
        ]);
        const instance = await IntegrationManager.getInstanceFromIntegrationId({
            userId: req.userManager.getUserId(),
            integrationId: params.integrationId,
        });

        if (!instance) {
            throw Boom.notFound();
        }

        const start = Date.now();
        await instance.testAuth();
        const errors = instance.integration.messages?.errors?.filter(
            ({ timestamp }) => timestamp >= start
        );

        if (errors?.length) {
            res.status(400);
            res.json({ errors });
        } else {
            res.json({ status: 'ok' });
        }
    })
);

router.route('/api/entities/:entityId/test-auth').get(
    catchAsyncError(async (req, res) => {
        const params = RouterUtil.checkRequiredParams(req.params, ['entityId']);
        const entity = await EntityManager.getEntityManagerInstanceFromEntityId(
            params.entityId,
            req.userManager.getUserId()
        );

        if (!entity) {
            throw Boom.notFound();
        }

        const testAuthResponse = await entity.testAuth();

        if (!testAuthResponse) {
            res.status(400);
            res.json({
                errors: [
                    {
                        title: 'Authentication Error',
                        message: `There was an error with your ${entity.constructor.getName()} Entity.  Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                        timestamp: Date.now(),
                    },
                ],
            });
        } else {
            res.json({ status: 'ok' });
        }
    })
);

module.exports = router;
