import type { IntegrationRepositoryInterface } from '../repositories/integration-repository-interface';

export class UpdateIntegrationMessages {
    private readonly integrationRepository: IntegrationRepositoryInterface;

    constructor({ integrationRepository }: { integrationRepository: IntegrationRepositoryInterface }) {
        this.integrationRepository = integrationRepository;
    }

    async execute(
        integrationId: string,
        messageType: string,
        messageTitle: string,
        messageBody: string,
        messageTimestamp: number | string | Date
    ): Promise<boolean> {
        const integration = await this.integrationRepository.updateIntegrationMessages(
            integrationId,
            messageType,
            messageTitle,
            messageBody,
            messageTimestamp as number | Date
        );
        return integration;
    }
}
