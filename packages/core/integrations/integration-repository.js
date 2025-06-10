const { IntegrationModel } = require('./integration-model');

class IntegrationRepository {
    async findIntegrationsByUserId(userId) {
        const integrationRecords = await IntegrationModel.find({ user: userId }, '', { lean: true }).populate('entities');
        return integrationRecords.map(integrationRecord => ({
            id: integrationRecord._id,
            entitiesIds: integrationRecord.entities.map(e => e._id),
            userId: integrationRecord.user.toString(),
            config: integrationRecord.config,
            version: integrationRecord.version,
            status: integrationRecord.status,
            messages: integrationRecord.messages,
        }));
    }

    async deleteIntegrationById(integrationId) {
        return IntegrationModel.deleteOne({ _id: integrationId });
    }

    async findIntegrationById(id) {
        const integrationRecord = await IntegrationModel.findById(id, '', { lean: true }).populate('entities');
        return {
            id: integrationRecord._id,
            entitiesIds: integrationRecord.entities.map(e => e._id),
            userId: integrationRecord.user.toString(),
            config: integrationRecord.config,
            version: integrationRecord.version,
            status: integrationRecord.status,
            messages: integrationRecord.messages,
        }
    }

    async createIntegration(entities, userId, config) {
        return IntegrationModel.create({
            entities: entities,
            user: userId,
            config,
            version: '0.0.0',
        });
    }
}

module.exports = { IntegrationRepository };
