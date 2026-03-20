import { RequiredPropertyError } from '../errors';
import { get } from '../assertions';
import type { IntegrationModuleDefinition, IntegrationDisplay, OptionDetails } from './types';

interface OptionsParams {
    module: IntegrationModuleDefinition;
    isMany?: boolean;
    hasUserConfig?: boolean;
    requiresNewEntity?: boolean;
    display?: IntegrationDisplay;
    [key: string]: unknown;
}

export class Options {
    module: IntegrationModuleDefinition;
    isMany: boolean;
    hasUserConfig: boolean;
    requiresNewEntity: boolean;
    display: {
        name: string;
        description: string;
        detailsUrl: string;
        icon: string;
    };

    constructor(params: OptionsParams) {
        this.module = get(params, 'module');
        this.isMany = Boolean(get(params, 'isMany', false));
        this.hasUserConfig = Boolean(get(params, 'hasUserConfig', false));
        this.requiresNewEntity = Boolean(
            get(params, 'requiresNewEntity', false)
        );
        if (!params.display) {
            throw new RequiredPropertyError({
                parent: { name: 'Options' },
                key: 'display',
            });
        }

        this.display = {
            name: get(params.display, 'label') as string,
            description: get(params.display, 'description') as string,
            detailsUrl: get(params.display, 'detailsUrl') as string,
            icon: get(params.display, 'icon') as string,
        };
    }

    get(): OptionDetails {
        return {
            type: this.module.definition.getName(),
            hasUserConfig: this.hasUserConfig,
            isMany: this.isMany,
            requiresNewEntity: this.requiresNewEntity,
            display: this.display,
        };
    }
}
