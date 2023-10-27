const { Credential, Entity } = require("../module-plugin");
const { IntegrationModel } = require("../integrations");
const mongoose = require("mongoose");

async function createMockIntegration(IntegrationClassDef, userId = null, config = {},) {
    const integration = new IntegrationClassDef();
    userId = userId || new mongoose.Types.ObjectId();
    integration.delegateTypes.push(...IntegrationClassDef.Config.events)

    const insertOptions = {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
    }
    const user = {user: userId}

    const credential = await Credential.findOneAndUpdate(
        user,
        { $set: user },
        insertOptions
    );
    const entity1 = await Entity.findOneAndUpdate(
        user,
        {
            $set: {
                credential: credential.id,
                user: userId,
                name: 'Test user',
                externalId: '1234567890123456',
            },
        },
        insertOptions
    );
    const entity2 = await Entity.findOneAndUpdate(
        user,
        {
            $set: {
                credential: credential.id,
                user: userId,
            },
        },
        insertOptions
    );

    const entities = [entity1, entity2]
    integration.record = await IntegrationModel.create({
        entities,
        user: userId,
        config: {type: IntegrationClassDef.Config.name, ...config}
    })

    integration.id = integration.record._id

    for (const i in entities){
        const [moduleName, ModuleClass] = Object.entries(IntegrationClassDef.modules)[i];
        const module = new ModuleClass({userId})
        module.entity = entities[i];
        integration[moduleName] = module;
    }

    return integration
}

module.exports = createMockIntegration;
