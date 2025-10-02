class CheckIntegrationsHealthUseCase {
    constructor({ moduleFactory, integrationFactory }) {
        this.moduleFactory = moduleFactory;
        this.integrationFactory = integrationFactory;
    }

    execute() {
        const moduleTypes = Array.isArray(this.moduleFactory.moduleTypes)
            ? this.moduleFactory.moduleTypes
            : [];

        const integrationTypes = Array.isArray(
            this.integrationFactory.integrationTypes
        )
            ? this.integrationFactory.integrationTypes
            : [];

        return {
            status: 'healthy',
            modules: {
                count: moduleTypes.length,
                available: moduleTypes,
            },
            integrations: {
                count: integrationTypes.length,
                available: integrationTypes,
            },
        };
    }
}

module.exports = { CheckIntegrationsHealthUseCase };
