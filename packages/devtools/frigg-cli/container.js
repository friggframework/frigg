const path = require('path');
const {findNearestBackendPackageJson} = require('./utils/backend-path');

// Infrastructure
const {FileSystemAdapter} = require('./infrastructure/adapters/FileSystemAdapter');
const {SchemaValidator} = require('./infrastructure/adapters/SchemaValidator');
const {BackendJsUpdater} = require('./infrastructure/adapters/BackendJsUpdater');
const {IntegrationJsUpdater} = require('./infrastructure/adapters/IntegrationJsUpdater');
const {FileSystemIntegrationRepository} = require('./infrastructure/repositories/FileSystemIntegrationRepository');
const {FileSystemAppDefinitionRepository} = require('./infrastructure/repositories/FileSystemAppDefinitionRepository');
const {FileSystemApiModuleRepository} = require('./infrastructure/repositories/FileSystemApiModuleRepository');
const {UnitOfWork} = require('./infrastructure/UnitOfWork');

// Domain Services
const {IntegrationValidator} = require('./domain/services/IntegrationValidator');

// Application
const {CreateIntegrationUseCase} = require('./application/use-cases/CreateIntegrationUseCase');
const {CreateApiModuleUseCase} = require('./application/use-cases/CreateApiModuleUseCase');
const {AddApiModuleToIntegrationUseCase} = require('./application/use-cases/AddApiModuleToIntegrationUseCase');

/**
 * Dependency Injection Container
 * Manages object creation and dependency wiring
 */
class Container {
    constructor(startDir = process.cwd()) {
        // Find backend directory
        this.backendPath = findNearestBackendPackageJson(startDir);
        if (!this.backendPath) {
            throw new Error('Could not find backend directory. Make sure you are in a Frigg project.');
        }
        this.projectRoot = path.dirname(this.backendPath); // For backwards compatibility
        this.instances = new Map();
    }

    /**
     * Get or create singleton instance
     */
    get(serviceName) {
        if (this.instances.has(serviceName)) {
            return this.instances.get(serviceName);
        }

        const instance = this._create(serviceName);
        this.instances.set(serviceName, instance);
        return instance;
    }

    /**
     * Create service instance with dependencies
     */
    _create(serviceName) {
        switch (serviceName) {
            // Infrastructure - Adapters
            case 'FileSystemAdapter':
                return new FileSystemAdapter();

            case 'SchemaValidator':
                // Point to schemas package in monorepo
                // Schema validator should always use the schemas from the frigg monorepo,
                // not relative to the user's project
                const schemasPath = path.join(__dirname, '../../schemas/schemas');
                return new SchemaValidator(schemasPath);

            case 'BackendJsUpdater':
                return new BackendJsUpdater(
                    this.get('FileSystemAdapter'),
                    this.backendPath
                );

            case 'IntegrationJsUpdater':
                return new IntegrationJsUpdater(
                    this.get('FileSystemAdapter'),
                    this.backendPath
                );

            // Infrastructure - Repositories
            case 'IntegrationRepository':
                return new FileSystemIntegrationRepository(
                    this.get('FileSystemAdapter'),
                    this.backendPath,
                    this.get('SchemaValidator')
                );

            case 'AppDefinitionRepository':
                return new FileSystemAppDefinitionRepository(
                    this.get('FileSystemAdapter'),
                    this.backendPath,
                    this.get('SchemaValidator')
                );

            case 'ApiModuleRepository':
                return new FileSystemApiModuleRepository(
                    this.get('FileSystemAdapter'),
                    this.backendPath,
                    this.get('SchemaValidator')
                );

            // Infrastructure - Unit of Work
            case 'UnitOfWork':
                return new UnitOfWork(
                    this.get('FileSystemAdapter')
                );

            // Domain Services
            case 'IntegrationValidator':
                return new IntegrationValidator(
                    this.get('IntegrationRepository')
                );

            // Application - Use Cases
            case 'CreateIntegrationUseCase':
                return new CreateIntegrationUseCase(
                    this.get('IntegrationRepository'),
                    this.get('UnitOfWork'),
                    this.get('IntegrationValidator'),
                    this.get('AppDefinitionRepository'),
                    this.get('BackendJsUpdater')
                );

            case 'CreateApiModuleUseCase':
                return new CreateApiModuleUseCase(
                    this.get('ApiModuleRepository'),
                    this.get('UnitOfWork'),
                    this.get('AppDefinitionRepository')
                );

            case 'AddApiModuleToIntegrationUseCase':
                return new AddApiModuleToIntegrationUseCase(
                    this.get('IntegrationRepository'),
                    this.get('ApiModuleRepository'),
                    this.get('UnitOfWork'),
                    this.get('IntegrationValidator'),
                    this.get('IntegrationJsUpdater')
                );

            default:
                throw new Error(`Unknown service: ${serviceName}`);
        }
    }

    /**
     * Clear all instances (useful for testing)
     */
    clear() {
        this.instances.clear();
    }

    /**
     * Set project root directory
     */
    setProjectRoot(projectRoot) {
        this.projectRoot = projectRoot;
        this.clear(); // Clear cached instances
    }
}

// Export singleton container
let containerInstance = null;

module.exports = {
    Container,
    getContainer: (projectRoot) => {
        if (!containerInstance) {
            containerInstance = new Container(projectRoot);
        } else if (projectRoot) {
            containerInstance.setProjectRoot(projectRoot);
        }
        return containerInstance;
    }
};
