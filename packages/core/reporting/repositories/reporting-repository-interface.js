class ReportingRepositoryInterface {
    // returns: [{ id, type, status, userId, version, errorCount, moduleCount, createdAt, updatedAt }]
    async findIntegrationsForReport(filter) {
        throw new Error(
            'Method findIntegrationsForReport must be implemented by subclass'
        );
    }

    async countMappingsByIntegrationIds(ids) {
        throw new Error(
            'Method countMappingsByIntegrationIds must be implemented by subclass'
        );
    }
}

module.exports = { ReportingRepositoryInterface };
