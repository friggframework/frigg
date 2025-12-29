class TestModuleFactory {
    constructor() {
        this.moduleRepository = {
            findEntity: jest.fn().mockResolvedValue(null),
            findEntitiesBy: jest.fn().mockResolvedValue([]),
        };
    }

    async getModuleInstance(entityId, userId) {
        return {
            getName() {
                return 'stubModule';
            },
            api: {},
            entityId,
            userId,
            testAuth: async () => true,
        };
    }
}

module.exports = { TestModuleFactory };
