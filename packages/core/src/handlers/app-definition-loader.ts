import { findNearestBackendPackageJson } from '../utils';
import path from 'node:path';
import fs from 'fs-extra';

export interface IntegrationClass {
    Definition: {
        name: string;
        modules?: Record<string, string>;
        routes?: any[];
        webhooks?: any;
        [key: string]: unknown;
    };
    new (...args: any[]): any;
    [key: string]: unknown;
}

export interface UserConfig {
    usePassword?: boolean;
    primary?: string;
    individualUserRequired?: boolean;
    organizationUserRequired?: boolean;
    [key: string]: unknown;
}

export interface AppDefinition {
    integrations: IntegrationClass[];
    userConfig: UserConfig | null;
}

/**
 * Loads the App definition from the nearest backend package
 */
export function loadAppDefinition(): AppDefinition {
    const backendPath = findNearestBackendPackageJson();
    if (!backendPath) {
        throw new Error('Could not find backend package.json');
    }

    const backendDir = path.dirname(backendPath);
    const backendFilePath = path.join(backendDir, 'index.js');
    if (!fs.existsSync(backendFilePath)) {
        throw new Error('Could not find index.js');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const backendJsFile = require(backendFilePath) as { Definition: { integrations?: IntegrationClass[]; user?: UserConfig } };
    const appDefinition = backendJsFile.Definition;

    const { integrations = [], user: userConfig = null } = appDefinition;
    return { integrations, userConfig };
}

