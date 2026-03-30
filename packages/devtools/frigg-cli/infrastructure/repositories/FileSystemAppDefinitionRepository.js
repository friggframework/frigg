const path = require('path');
const {AppDefinition} = require('../../domain/entities/AppDefinition');
const {IAppDefinitionRepository} = require('../../domain/ports/IAppDefinitionRepository');

/**
 * FileSystemAppDefinitionRepository
 *
 * Concrete implementation of IAppDefinitionRepository for file system storage
 * Reads/writes app-definition.json in the project root
 */
class FileSystemAppDefinitionRepository extends IAppDefinitionRepository {
    constructor(fileSystemAdapter, backendPath, schemaValidator) {
        super();
        this.fileSystemAdapter = fileSystemAdapter;
        this.backendPath = backendPath;
        this.schemaValidator = schemaValidator;
        this.appDefinitionPath = path.join(backendPath, 'app-definition.json');
    }

    /**
     * Load app definition from file system
     * @returns {Promise<AppDefinition|null>}
     */
    async load() {
        if (!await this.exists()) {
            return null;
        }

        const content = await this.fileSystemAdapter.readFile(this.appDefinitionPath);
        const data = JSON.parse(content);

        return this._toDomainEntity(data);
    }

    /**
     * Save app definition to file system
     * @param {AppDefinition} appDefinition
     * @returns {Promise<AppDefinition>}
     */
    async save(appDefinition) {
        // 1. Validate domain entity
        const validation = appDefinition.validate();
        if (!validation.isValid) {
            throw new Error(`AppDefinition validation failed: ${validation.errors.join(', ')}`);
        }

        // 2. Convert to JSON
        const json = appDefinition.toJSON();

        // 3. Validate against schema
        const schemaValidation = await this.schemaValidator.validate('app-definition', json);
        if (!schemaValidation.valid) {
            throw new Error(`Schema validation failed: ${schemaValidation.errors.join(', ')}`);
        }

        // 4. Ensure directory exists
        const dir = path.dirname(this.appDefinitionPath);
        await this.fileSystemAdapter.ensureDirectory(dir);

        // 5. Write file atomically
        const content = JSON.stringify(json, null, 2);

        if (await this.exists()) {
            await this.fileSystemAdapter.updateFile(this.appDefinitionPath, () => content);
        } else {
            await this.fileSystemAdapter.writeFile(this.appDefinitionPath, content);
        }

        return appDefinition;
    }

    /**
     * Check if app definition exists
     * @returns {Promise<boolean>}
     */
    async exists() {
        return await this.fileSystemAdapter.exists(this.appDefinitionPath);
    }

    /**
     * Create a new app definition
     * @param {object} props
     * @returns {Promise<AppDefinition>}
     */
    async create(props) {
        if (await this.exists()) {
            throw new Error('App definition already exists');
        }

        const appDefinition = AppDefinition.create(props);
        await this.save(appDefinition);

        return appDefinition;
    }

    /**
     * Convert JSON to domain entity
     * @param {object} data
     * @returns {AppDefinition}
     */
    _toDomainEntity(data) {
        return new AppDefinition({
            name: data.name,
            version: data.version,
            description: data.description,
            author: data.author,
            license: data.license,
            repository: data.repository,
            integrations: data.integrations || [],
            apiModules: data.apiModules || [],
            config: data.config || {}
        });
    }
}

module.exports = {FileSystemAppDefinitionRepository};
