class TestModuleFactory {
    constructor() { }

    async getModuleInstance(entityId, userId) {
        // return minimal stub module with getName and api property
        return {
            getName() { return 'stubModule'; },
            api: {},
            entityId,
            userId,
            testAuth: async () => true,
        };
    }
}

module.exports = { TestModuleFactory }; 