import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';

export class UpdateIntegrationStatus {
    private integrationRepository: IntegrationRepositoryInterface;

    constructor({ integrationRepository }: { integrationRepository: IntegrationRepositoryInterface }) {
        this.integrationRepository = integrationRepository;
    }

    async execute(integrationId: string, status: string): Promise<boolean> {
        const integration = await this.integrationRepository.updateIntegrationStatus(
            integrationId,
            status
        );
        return integration;
    }
}
