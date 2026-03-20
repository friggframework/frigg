export class TestModuleFactory {
    constructor() { }

    async getModuleInstance(entityId: string, userId: string) {
        return {
            getName() { return 'stubModule'; },
            api: {},
            entityId,
            userId,
            testAuth: async () => true,
        };
    }
}
