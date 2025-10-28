const { ValidationResult } = require('../value-objects/ValidationResult');

class PreFlightChecker {
    constructor(fileSystem) {
        if (!fileSystem) {
            throw new Error('File system dependency is required');
        }

        if (
            typeof fileSystem.fileExists !== 'function' ||
            typeof fileSystem.readFile !== 'function' ||
            typeof fileSystem.resolvePath !== 'function'
        ) {
            throw new Error('File system must implement fileExists, readFile, and resolvePath methods');
        }

        this.fileSystem = fileSystem;
    }

    /**
     * Performs pre-flight checks on application directory
     * @param {string} appPath - Path to application directory
     * @returns {Promise<ValidationResult>} Validation result with metadata
     */
    async check(appPath) {
        if (!appPath || appPath === '') {
            throw new Error('App path is required');
        }

        try {
            const errors = [];
            const files = {
                indexJs: false,
                infrastructureJs: false,
                packageJson: false,
            };

            const requiredFiles = [
                { name: 'index.js', key: 'indexJs' },
                { name: 'infrastructure.js', key: 'infrastructureJs' },
                { name: 'package.json', key: 'packageJson' },
            ];

            const resolvedPaths = {};

            for (const file of requiredFiles) {
                const filePath = this.fileSystem.resolvePath(appPath, file.name);
                resolvedPaths[file.key] = filePath;

                const exists = await this.fileSystem.fileExists(filePath);
                files[file.key] = exists;

                if (!exists) {
                    errors.push(`Missing required file: ${file.name}`);
                }
            }

            if (!files.infrastructureJs) {
                return ValidationResult.failure(errors, [], { files });
            }
            let appDefinition;
            try {
                const infrastructureContent = await this.fileSystem.readFile(resolvedPaths.infrastructureJs);
                appDefinition = this._parseInfrastructureFile(infrastructureContent);
            } catch (error) {
                if (error.message.includes('Failed to parse infrastructure.js')) {
                    errors.push(error.message);
                    return ValidationResult.failure(errors, [], { files });
                }
                errors.push(`Failed to read infrastructure.js: ${error.message}`);
                return ValidationResult.failure(errors, [], { files });
            }

            const structureErrors = this._validateAppDefinitionStructure(appDefinition);
            errors.push(...structureErrors);

            const propertyErrors = this._validateRequiredProperties(appDefinition);
            errors.push(...propertyErrors);
            if (files.packageJson) {
                try {
                    const packageContent = await this.fileSystem.readFile(resolvedPaths.packageJson);
                    JSON.parse(packageContent);
                } catch (error) {
                    if (error instanceof SyntaxError) {
                        errors.push(`Failed to parse package.json: Invalid JSON syntax`);
                    } else {
                        errors.push(`Failed to read package.json: ${error.message}`);
                    }
                }
            }

            const metadata = this._extractMetadata(appDefinition, files);

            if (errors.length > 0) {
                return ValidationResult.failure(errors, [], metadata);
            }

            return ValidationResult.success(metadata);
        } catch (error) {
            return ValidationResult.failure([`Pre-flight check failed: ${error.message}`], []);
        }
    }

    _parseInfrastructureFile(content) {
        try {
            const match = content.match(/module\.exports\s*=\s*({[\s\S]*}|.*);?/);
            if (!match) {
                throw new Error('Invalid infrastructure.js format');
            }

            const exportedValue = match[1];
            const evaluator = new Function(`return ${exportedValue}`);
            return evaluator();
        } catch (error) {
            throw new Error('Failed to parse infrastructure.js: Invalid JavaScript syntax');
        }
    }

    _validateAppDefinitionStructure(appDefinition) {
        const errors = [];

        if (!appDefinition || typeof appDefinition !== 'object' || Array.isArray(appDefinition)) {
            errors.push('App definition must be an object');
        }

        return errors;
    }

    _validateRequiredProperties(appDefinition) {
        const errors = [];

        if (!appDefinition || typeof appDefinition !== 'object' || Array.isArray(appDefinition)) {
            return errors;
        }
        if (!appDefinition.name || appDefinition.name === '') {
            errors.push('App definition must have a name');
        }

        if (!appDefinition.provider || appDefinition.provider === '') {
            errors.push('App definition must have a provider');
        }

        if (!appDefinition.region || appDefinition.region === '') {
            errors.push('App definition must have a region');
        }

        return errors;
    }

    _extractMetadata(appDefinition, files) {
        return {
            appDefinition,
            appName: appDefinition?.name,
            provider: appDefinition?.provider,
            region: appDefinition?.region,
            stage: appDefinition?.stage || 'dev',
            files,
            hasVpc: appDefinition?.vpc?.enable === true,
            hasDatabase: appDefinition?.database?.postgres?.enable === true,
            hasEncryption: appDefinition?.encryption?.enable === true,
            hasSsm: appDefinition?.ssm?.enable === true,
            hasWebsockets: appDefinition?.websockets?.enable === true,
            hasIntegrations: Array.isArray(appDefinition?.integrations) && appDefinition.integrations.length > 0,
            integrationCount: appDefinition?.integrations?.length || 0,
        };
    }
}

module.exports = { PreFlightChecker };
