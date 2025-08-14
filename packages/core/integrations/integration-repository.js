const { IntegrationModel } = require('./integration-model');

class IntegrationRepository {
    async findIntegrationsByUserId(userId) {
        const integrationRecords = await IntegrationModel.find({ user: userId }, '', { lean: true }).populate('entities');
        return integrationRecords.map(integrationRecord => ({
            id: integrationRecord._id.toString(),
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

    async findIntegrationByName(name) {
        const integrationRecord = await IntegrationModel.findOne({ 'config.type': name }, '', { lean: true }).populate('entities');
        return {
            id: integrationRecord._id.toString(),
            entitiesIds: integrationRecord.entities.map(e => e._id),
            userId: integrationRecord.user.toString(),
            config: integrationRecord.config,
            version: integrationRecord.version,
            status: integrationRecord.status,
            messages: integrationRecord.messages,
        };
    }

    async findIntegrationById(id) {
        const integrationRecord = await IntegrationModel.findById(id, '', { lean: true }).populate('entities');
        return {
            id: integrationRecord._id.toString(),
            entitiesIds: integrationRecord.entities.map(e => e._id),
            userId: integrationRecord.user.toString(),
            config: integrationRecord.config,
            version: integrationRecord.version,
            status: integrationRecord.status,
            messages: integrationRecord.messages,
        }
    }

    async updateIntegrationStatus(integrationId, status) {
        const integrationRecord = await IntegrationModel.updateOne({ _id: integrationId }, { status });
        return integrationRecord.acknowledged;
    }

    async updateIntegrationMessages(integrationId, messageType, messageTitle, messageBody, messageTimestamp) {
        const integrationRecord = await IntegrationModel.updateOne(
            { _id: integrationId },
            { $push: { [`messages.${messageType}`]: { title: messageTitle, message: messageBody, timestamp: messageTimestamp } } }
        );
        return integrationRecord.acknowledged;
    }

    async createIntegration(entities, userId, config) {
        const integrationRecord = await IntegrationModel.create({
            entities: entities,
            user: userId,
            config,
            version: '0.0.0',
        });

        return {
            id: integrationRecord._id.toString(),
            entitiesIds: integrationRecord.entities.map(e => e._id),
            userId: integrationRecord.user.toString(),
            config: integrationRecord.config,
            version: integrationRecord.version,
            status: integrationRecord.status,
            messages: integrationRecord.messages,
        };
    }
}

module.exports = { IntegrationRepository };
