const path = require('path');
const {IIntegrationRepository} = require('../../domain/ports/IIntegrationRepository');
const {Integration} = require('../../domain/entities/Integration');
const {IntegrationName} = require('../../domain/value-objects/IntegrationName');

/**
 * FileSystemIntegrationRepository
 * Persists Integration entities to the file system
 */
class FileSystemIntegrationRepository extends IIntegrationRepository {
    constructor(fileSystemAdapter, backendPath, schemaValidator, templateEngine = null) {
        super();
        this.fileSystemAdapter = fileSystemAdapter;
        this.backendPath = backendPath;
        this.schemaValidator = schemaValidator;
        this.templateEngine = templateEngine;
        this.integrationsDir = path.join(backendPath, 'src/integrations');
    }

    /**
     * Save integration to file system
     */
    async save(integration) {
        // Validate domain entity
        const validation = integration.validate();
        if (!validation.isValid) {
            throw new Error(`Invalid integration: ${validation.errors.join(', ')}`);
        }

        // Convert to persistence format
        const persistenceData = this._toPersistenceFormat(integration);

        // Validate against schema
        const schemaValidation = await this.schemaValidator.validate(
            'integration-definition',
            persistenceData.definition
        );

        if (!schemaValidation.valid) {
            throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`);
        }

        // Ensure integrations directory exists
        await this.fileSystemAdapter.ensureDirectory(this.integrationsDir);

        // Write single Integration.js file
        // Note: Integration.js should only be written on creation, not on updates
        // to preserve manual edits and module additions
        const integrationJsPath = this._getIntegrationFilePath(integration.name.value);
        const integrationJsExists = await this.fileSystemAdapter.exists(integrationJsPath);

        if (!integrationJsExists) {
            await this.fileSystemAdapter.writeFile(integrationJsPath, persistenceData.classFile);
        }

        return integration;
    }

    /**
     * Find integration by name
     */
    async findByName(name) {
        const nameStr = typeof name === 'string' ? name : name.value;
        const integrationPath = this._getIntegrationFilePath(nameStr);

        if (!await this.fileSystemAdapter.exists(integrationPath)) {
            return null;
        }

        // Read the Integration.js file and extract static Definition
        const content = await this.fileSystemAdapter.readFile(integrationPath);

        // Parse the static Definition from the file
        // This is a simple implementation - could be enhanced with AST parsing
        const definitionMatch = content.match(/static Definition = ({[\s\S]*?});/);
        if (!definitionMatch) {
            return null;
        }

        try {
            // Evaluate the definition object (be careful - this is simplified)
            const definitionStr = definitionMatch[1];
            // For now, just extract basic info using regex
            const nameMatch = definitionStr.match(/name:\s*['"]([^'"]+)['"]/);
            const versionMatch = definitionStr.match(/version:\s*['"]([^'"]+)['"]/);

            if (!nameMatch || !versionMatch) {
                return null;
            }

            return new Integration({
                name: nameMatch[1],
                version: versionMatch[1],
                displayName: nameStr,
                description: '',
            });
        } catch (error) {
            return null;
        }
    }

    /**
     * Check if integration exists
     */
    async exists(name) {
        const nameStr = typeof name === 'string' ? name : name.value;
        const integrationPath = this._getIntegrationFilePath(nameStr);
        return await this.fileSystemAdapter.exists(integrationPath);
    }

    /**
     * Get the file path for an integration
     */
    _getIntegrationFilePath(name) {
        const className = this._toClassName(name);
        return path.join(this.integrationsDir, `${className}Integration.js`);
    }

    /**
     * Convert kebab-case name to ClassName
     */
    _toClassName(name) {
        return name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');
    }

    /**
     * List all integrations by reading Integration.js files
     */
    async list() {
        if (!await this.fileSystemAdapter.exists(this.integrationsDir)) {
            return [];
        }

        const files = await this.fileSystemAdapter.listFiles(this.integrationsDir, '*.js');
        const integrations = [];

        for (const fileName of files) {
            // Only process files matching {Name}Integration.js pattern
            if (!fileName.endsWith('Integration.js')) {
                continue;
            }

            try {
                // Extract integration name from filename
                const className = fileName.replace('.js', '').replace('Integration', '');
                const kebabName = this._toKebabCase(className);

                const integration = await this.findByName(kebabName);
                if (integration) {
                    integrations.push(integration);
                }
            } catch (error) {
                console.warn(`Failed to load integration ${fileName}:`, error.message);
            }
        }

        return integrations;
    }

    /**
     * Convert ClassName to kebab-case
     */
    _toKebabCase(className) {
        return className
            .replace(/([a-z])([A-Z])/g, '$1-$2')
            .toLowerCase();
    }

    /**
     * Convert domain entity to persistence format
     */
    _toPersistenceFormat(integration) {
        const json = integration.toJSON();

        return {
            classFile: this._generateIntegrationClass(integration),
            definition: json, // Still needed for schema validation
        };
    }

    /**
     * Convert persistence data to domain entity
     */
    _toDomainEntity(persistenceData) {
        return new Integration({
            name: persistenceData.name,
            version: persistenceData.version,
            displayName: persistenceData.display?.name,
            description: persistenceData.display?.description,
            type: persistenceData.options?.type || 'custom',
            category: persistenceData.display?.category,
            tags: persistenceData.display?.tags || [],
            entities: persistenceData.entities || {},
            apiModules: [], // Would need to extract from somewhere
            capabilities: persistenceData.capabilities || {},
            requirements: persistenceData.requirements || {},
            options: persistenceData.options || {}
        });
    }

    /**
     * Generate Integration.js class file
     */
    _generateIntegrationClass(integration) {
        const className = integration.name.value
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('');

        const obj = integration.toObject();

        return `const { IntegrationBase } = require('@friggframework/core');

/**
 * ${integration.displayName} Integration
 * ${integration.description || 'No description provided'}
 */
class ${className}Integration extends IntegrationBase {
    static Definition = {
        name: '${obj.name}',
        version: '${obj.version}',
        supportedVersions: ['${obj.version}'],
        hasUserConfig: false,

        display: {
            label: '${integration.displayName}',
            description: '${integration.description || 'No description provided'}',
            category: '${integration.category || 'Other'}',
            detailsUrl: '',
            icon: '',
        },
        modules: {
            // Add your API modules here
            // Example:
            // myModule: {
            //     definition: myModule.Definition,
            // },
        },
        routes: [
            // Define your integration routes here
            // Example:
            // {
            //     path: '/auth',
            //     method: 'GET',
            //     event: 'AUTH_REQUEST',
            // },
        ],
    };

    constructor() {
        super();
        this.events = {
            // Define your event handlers here
            // Example:
            // AUTH_REQUEST: {
            //     handler: this.authRequest.bind(this),
            // },
        };
    }

    // TODO: Add your integration methods here
    // Example:
    // async authRequest({ res }) {
    //     return res.json({ url: 'https://example.com/auth' });
    // }
}

module.exports = ${className}Integration;
`;
    }

}

module.exports = {FileSystemIntegrationRepository};
