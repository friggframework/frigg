const {
    ReportingRepositoryInterface,
} = require('./reporting-repository-interface');

describe('ReportingRepositoryInterface', () => {
    const repo = new ReportingRepositoryInterface();

    it('findIntegrationsForReport is abstract', async () => {
        await expect(repo.findIntegrationsForReport({})).rejects.toThrow(
            /must be implemented by subclass/
        );
    });

    it('countMappingsByIntegrationIds is abstract', async () => {
        await expect(repo.countMappingsByIntegrationIds([])).rejects.toThrow(
            /must be implemented by subclass/
        );
    });
});
