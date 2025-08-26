const {
    Auther,
    Credential,
    Entity,
    IntegrationFactory,
    createObjectId,
} = require('@friggframework/core');

async function createMockIntegration(
    IntegrationClass,
    userId = null,
    config = { type: IntegrationClass.Definition.name }
) {
    const integrationFactory = new IntegrationFactory([IntegrationClass]);
    userId = userId || createObjectId();

    const insertOptions = {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
    };
    const user = { user: userId };

    const entities = [];
    for (const moduleName in IntegrationClass.modules) {
        const ModuleDef = IntegrationClass.Definition.modules[moduleName];
        const module = await Auther.getInstance({
            definition: ModuleDef,
            userId: userId,
        });
        const credential = await module.CredentialModel.findOneAndUpdate(
            user,
            { $set: user },
            insertOptions
        );
        entities.push(
            (
                await module.EntityModel.findOneAndUpdate(
                    user,
                    {
                        $set: {
                            credential,
                            user: userId,
                            name: `Test ${moduleName}`,
                            externalId: `1234567890123456_${moduleName}`,
                        },
                    },
                    insertOptions
                )
            ).id
        );
    }

    const integration = await integrationFactory.createIntegration(
        entities,
        userId,
        config
    );

    integration.id = integration.record._id;

    return integration;
}

function createMockApiObject(jest, api = {}, mockMethodMap) {
    // take in an api class and object with keys that are method names
    // and values which are the mock response (or implementation)
    const clone = (data) => JSON.parse(JSON.stringify(data));

    for (const [methodName, mockDataOrImplementation] of Object.entries(
        mockMethodMap
    )) {
        if (mockDataOrImplementation instanceof Function) {
            api[methodName] = jest.fn(mockDataOrImplementation);
        } else if (api[methodName]?.constructor?.name === 'AsyncFunction') {
            api[methodName] = jest
                .fn()
                .mockResolvedValue(clone(mockDataOrImplementation));
        } else {
            api[methodName] = jest
                .fn()
                .mockReturnValue(clone(mockDataOrImplementation));
        }
    }
    return api;
}

module.exports = { createMockIntegration, createMockApiObject };
