const { Auther, Credential, Entity, IntegrationFactory, createObjectId } = require('@friggframework/core');


async function createMockIntegration(IntegrationClassDef, userId = null, config = {},) {
    const integrationFactory = new IntegrationFactory([IntegrationClassDef]);
    userId = userId || createObjectId();

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

    const integration =
        await integrationFactory.createIntegration(
            entities,
            userId,
            config,
        );

    integration.id = integration.record._id

    for (const i in entities){
        if (Object.entries(IntegrationClassDef.modules).length <= i) break
        const [moduleName, ModuleDef] = Object.entries(IntegrationClassDef.modules)[i];
        const module = await Auther.getInstance({definition: ModuleDef, userId: userId})
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
