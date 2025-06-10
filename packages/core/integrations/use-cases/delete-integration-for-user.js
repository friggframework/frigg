const Boom = require('@hapi/boom');

class DeleteIntegrationForUser {
    constructor({ integrationRepository, integrationClasses }) {

        /**
         * @type {import('../integration-repository').IntegrationRepository}
         */
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
    }

    async execute(integrationId, userId) {
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw Boom.notFound(
                `Integration with id of ${integrationId} does not exist`
            );
        }

        const integrationClass = this.integrationClasses.find(
            (integrationClass) => integrationClass.Definition.name === integrationRecord.config.type
        );

        if (integrationRecord.userId !== userId) {
            throw new Error(
                `Integration ${integrationId} does not belong to User ${userId}`
            );
        }

        const integrationInstance = new Integration({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: integrationRecord.entitiesIds,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            integrationClass: integrationClass,
            modules: [],
        });

        // 6. Complete async initialization (load dynamic actions, register handlers)
        await integrationInstance.initialize();
        await integrationInstance.send('ON_DELETE');

        await this.integrationRepository.deleteIntegrationById(integrationId);

    }
}

module.exports = { DeleteIntegrationForUser }; 