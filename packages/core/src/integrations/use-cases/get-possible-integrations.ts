import type { IntegrationClass, OptionDetails } from '../types';

export class GetPossibleIntegrations {
    private integrationClasses: IntegrationClass[];

    constructor({ integrationClasses }: { integrationClasses: IntegrationClass[] }) {
        this.integrationClasses = integrationClasses;
    }

    async execute(): Promise<OptionDetails[]> {
        return this.integrationClasses.map((integrationClass) =>
            integrationClass.getOptionDetails()
        );
    }
}
