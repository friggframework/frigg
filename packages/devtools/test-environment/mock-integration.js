const { Auther, Credential, Entity } = require('../../core/module-plugin');
const { IntegrationModel } = require('../../core/integrations');
const { mongoose } = require('../../core/database/mongoose');

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
        const [moduleName, ModuleDef] = Object.entries(IntegrationClassDef.modules)[i];
        const module = Auther.getInstance({definition: ModuleDef, userId: userId})
        module.entity = entities[i];
        integration[moduleName] = module;
    }

    return integration
}

function createMockApiObject(jest, api = {}, mockMethodMap) {
    // take in an api class and object with keys that are method names
    // and values which are the mock response (or implementation)
    const clone = (data) => JSON.parse(JSON.stringify(data));

    for (const [methodName, mockDataOrImplementation] of Object.entries(mockMethodMap)) {
        if (mockDataOrImplementation instanceof Function) {
            api[methodName] = jest.fn(mockDataOrImplementation);
        }
        else if (api[methodName]?.constructor?.name === "AsyncFunction") {
            api[methodName] = jest.fn().mockResolvedValue(clone(mockDataOrImplementation));
        } else {
            api[methodName] = jest.fn().mockReturnValue(clone(mockDataOrImplementation));
        }
    }
    return api;
}

module.exports = {createMockIntegration, createMockApiObject};
