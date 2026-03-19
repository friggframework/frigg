/**
 * Encryption Schema Registry
 *
 * Centralized registry defining which fields require encryption for each Prisma model.
 * Database-agnostic, works identically for MongoDB and PostgreSQL.
 * Extensible by integration developers via appDefinition.
 *
 * Field path format: 'fieldName' or 'parent.child.field' for nested JSON.
 */

import { logger } from './logger';

export interface EncryptionModelConfig {
    fields: string[];
}

export interface EncryptionSchema {
    [modelName: string]: EncryptionModelConfig;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

export interface ModuleDefinition {
    encryption?: {
        credentialFields?: string[];
    };
}

/**
 * Core encryption schema (immutable - cannot be overridden by custom schemas)
 */
export const CORE_ENCRYPTION_SCHEMA: EncryptionSchema = {
    Credential: {
        fields: [
            'data.access_token',
            'data.refresh_token',
            'data.id_token',
            'data.api_key',
            'data.apiKey',
            'data.API_KEY_VALUE',
            'data.password',
            'data.client_secret',
        ],
    },
    IntegrationMapping: {
        fields: ['mapping'],
    },
    User: {
        fields: ['hashword'],
    },
    Token: {
        fields: ['token'],
    },
};

let customSchema: EncryptionSchema = {};

export function validateCustomSchema(schema: unknown): ValidationResult {
    const errors: string[] = [];

    if (!schema || typeof schema !== 'object') {
        errors.push('Custom schema must be an object');
        return { valid: false, errors };
    }

    for (const [modelName, config] of Object.entries(schema as EncryptionSchema)) {
        if (typeof modelName !== 'string' || !modelName) {
            errors.push(`Invalid model name: ${modelName}`);
            continue;
        }

        if (!config || typeof config !== 'object') {
            errors.push(`Model "${modelName}" must have a config object`);
            continue;
        }

        if (!Array.isArray(config.fields)) {
            errors.push(`Model "${modelName}" must have a "fields" array`);
            continue;
        }

        for (const fieldPath of config.fields) {
            if (typeof fieldPath !== 'string' || !fieldPath) {
                errors.push(`Model "${modelName}" has invalid field path: ${fieldPath}`);
            }

            const coreFields = CORE_ENCRYPTION_SCHEMA[modelName]?.fields || [];
            if (coreFields.includes(fieldPath)) {
                errors.push(
                    `Cannot override core encrypted field "${fieldPath}" in model "${modelName}"`
                );
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

export function registerCustomSchema(schema: EncryptionSchema): void {
    if (!schema || Object.keys(schema).length === 0) {
        return;
    }

    const validation = validateCustomSchema(schema);
    if (!validation.valid) {
        throw new Error(
            `Invalid custom encryption schema:\n- ${validation.errors.join('\n- ')}`
        );
    }

    customSchema = { ...schema };
    logger.info(
        `Registered custom encryption schema for models: ${Object.keys(customSchema).join(', ')}`
    );
}

export function extractCredentialFieldsFromModules(moduleDefinitions: ModuleDefinition[]): string[] {
    const fields: string[] = [];

    for (const moduleDef of moduleDefinitions) {
        if (!moduleDef?.encryption?.credentialFields) {
            continue;
        }

        const credentialFields = moduleDef.encryption.credentialFields;
        if (!Array.isArray(credentialFields) || credentialFields.length === 0) {
            continue;
        }

        for (const field of credentialFields) {
            const prefixedField = field.startsWith('data.') ? field : `data.${field}`;
            fields.push(prefixedField);
        }
    }

    return [...new Set(fields)];
}



export interface IntegrationClass {
    modules?: Record<string, unknown>;
    Definition?: {
        modules?: Record<string, unknown>;
    };
}

export function loadModuleEncryptionSchemas(integrations: IntegrationClass[]): void {
    if (!integrations) {
        throw new Error('integrations parameter is required');
    }

    if (!Array.isArray(integrations)) {
        throw new Error('integrations must be an array');
    }

    if (integrations.length === 0) {
        return;
    }

    const { getModulesDefinitionFromIntegrationClasses } = require('../../integrations/utils/map-integration-dto');

    const moduleDefinitions: ModuleDefinition[] = getModulesDefinitionFromIntegrationClasses(integrations);
    const credentialFields = extractCredentialFieldsFromModules(moduleDefinitions);

    if (credentialFields.length === 0) {
        return;
    }

    const moduleSchema: EncryptionSchema = {
        Credential: {
            fields: credentialFields,
        },
    };

    logger.info(
        `Registering module-level encryption for ${credentialFields.length} credential fields`
    );

    registerCustomSchema(moduleSchema);
}

export function loadCustomEncryptionSchema(): void {
    try {
        const path = require('node:path');
        const { findNearestBackendPackageJson } = require('../../../utils');

        const backendPackagePath = findNearestBackendPackageJson();
        if (!backendPackagePath) {
            return;
        }

        const backendDir = path.dirname(backendPackagePath);
        const backendIndexPath = path.join(backendDir, 'index.js');

        const backendModule = require(backendIndexPath);
        const appDefinition = backendModule?.Definition;

        if (!appDefinition) {
            return;
        }

        const appCustomSchema = appDefinition.encryption?.schema;
        if (appCustomSchema && Object.keys(appCustomSchema).length > 0) {
            registerCustomSchema(appCustomSchema);
        }

        const integrations = appDefinition.integrations;
        if (integrations && Array.isArray(integrations)) {
            loadModuleEncryptionSchemas(integrations);
        }
    } catch (error: unknown) {
        logger.debug('Could not load custom encryption schema:', (error as Error).message);
    }
}

export function getEncryptedFields(modelName: string): string[] {
    const coreFields = CORE_ENCRYPTION_SCHEMA[modelName]?.fields || [];
    const customFields = customSchema[modelName]?.fields || [];
    const allFields = [...coreFields, ...customFields];
    return [...new Set(allFields)];
}

export function hasEncryptedFields(modelName: string): boolean {
    return getEncryptedFields(modelName).length > 0;
}

export function getEncryptedModels(): string[] {
    const coreModels = Object.keys(CORE_ENCRYPTION_SCHEMA);
    const customModels = Object.keys(customSchema);
    return [...new Set([...coreModels, ...customModels])];
}

export function resetCustomSchema(): void {
    customSchema = {};
}