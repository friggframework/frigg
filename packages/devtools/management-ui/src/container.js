import api from './infrastructure/http/api-client.js'

// Domain interfaces (not instantiated directly, just for reference)
import { ProjectRepository } from './domain/interfaces/ProjectRepository.js'
import { UserRepository } from './domain/interfaces/UserRepository.js'
import { EnvironmentRepository } from './domain/interfaces/EnvironmentRepository.js'
import { SessionRepository } from './domain/interfaces/SessionRepository.js'
import { SocketService } from './domain/interfaces/SocketService.js'

// Infrastructure adapters
import { ProjectRepositoryAdapter } from './infrastructure/adapters/ProjectRepositoryAdapter.js'
import { UserRepositoryAdapter } from './infrastructure/adapters/UserRepositoryAdapter.js'
import { EnvironmentRepositoryAdapter } from './infrastructure/adapters/EnvironmentRepositoryAdapter.js'
import { SessionRepositoryAdapter } from './infrastructure/adapters/SessionRepositoryAdapter.js'
import { SocketServiceAdapter } from './infrastructure/adapters/SocketServiceAdapter.js'

// Application services
import { ProjectService } from './application/services/ProjectService.js'
import { UserService } from './application/services/UserService.js'
import { EnvironmentService } from './application/services/EnvironmentService.js'

/**
 * Dependency Injection Container
 * Manages the creation and lifecycle of application dependencies
 * Following the Inversion of Control (IoC) pattern
 */
class Container {
  constructor() {
    this.instances = new Map()
    this.singletons = new Set()
    this.factories = new Map()

    this.setupDependencies()
  }

  /**
   * Setup all dependency registrations
   */
  setupDependencies() {
    // Register API client as singleton
    this.registerSingleton('apiClient', () => api)

    // Register repositories as singletons (infrastructure layer)
    this.registerSingleton('projectRepository', () => {
      const apiClient = this.resolve('apiClient')
      return new ProjectRepositoryAdapter(apiClient)
    })

    this.registerSingleton('userRepository', () => {
      const apiClient = this.resolve('apiClient')
      return new UserRepositoryAdapter(apiClient)
    })

    this.registerSingleton('environmentRepository', () => {
      const apiClient = this.resolve('apiClient')
      return new EnvironmentRepositoryAdapter(apiClient)
    })

    this.registerSingleton('sessionRepository', () => {
      const apiClient = this.resolve('apiClient')
      return new SessionRepositoryAdapter(apiClient)
    })

    // Socket service will be registered separately when socket client is available

    // Register application services as singletons
    this.registerSingleton('projectService', () => {
      const projectRepository = this.resolve('projectRepository')
      return new ProjectService(projectRepository)
    })

    this.registerSingleton('userService', () => {
      const userRepository = this.resolve('userRepository')
      const sessionRepository = this.resolve('sessionRepository')
      return new UserService(userRepository, sessionRepository)
    })

    this.registerSingleton('environmentService', () => {
      const environmentRepository = this.resolve('environmentRepository')
      return new EnvironmentService(environmentRepository)
    })
  }

  /**
   * Register a singleton dependency
   * @param {string} name
   * @param {Function} factory
   */
  registerSingleton(name, factory) {
    this.singletons.add(name)
    this.factories.set(name, factory)
  }

  /**
   * Register a transient dependency (new instance each time)
   * @param {string} name
   * @param {Function} factory
   */
  registerTransient(name, factory) {
    this.factories.set(name, factory)
  }

  /**
   * Register a specific instance
   * @param {string} name
   * @param {*} instance
   */
  registerInstance(name, instance) {
    this.instances.set(name, instance)
    this.singletons.add(name)
  }

  /**
   * Resolve a dependency by name
   * @param {string} name
   * @returns {*}
   */
  resolve(name) {
    // Check if we have a cached singleton instance
    if (this.singletons.has(name) && this.instances.has(name)) {
      return this.instances.get(name)
    }

    // Check if we have a factory for this dependency
    if (!this.factories.has(name)) {
      throw new Error(`Dependency '${name}' is not registered`)
    }

    // Create the instance using the factory
    const factory = this.factories.get(name)
    const instance = factory()

    // Cache singletons
    if (this.singletons.has(name)) {
      this.instances.set(name, instance)
    }

    return instance
  }

  /**
   * Check if a dependency is registered
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    return this.factories.has(name) || this.instances.has(name)
  }

  /**
   * Register socket service with a specific socket client
   * This is called when the socket client becomes available
   * @param {*} socketClient
   */
  registerSocketClient(socketClient) {
    this.registerSingleton('socketService', () => {
      return new SocketServiceAdapter(socketClient)
    })
  }


  /**
   * Get all registered services (for debugging)
   * @returns {string[]}
   */
  getRegisteredServices() {
    const services = new Set()

    // Add factory-based services
    for (const name of this.factories.keys()) {
      services.add(name)
    }

    // Add instance-based services
    for (const name of this.instances.keys()) {
      services.add(name)
    }

    return Array.from(services).sort()
  }

  /**
   * Reset the container (useful for testing)
   */
  reset() {
    this.instances.clear()
    this.singletons.clear()
    this.factories.clear()
    this.setupDependencies()
  }

  /**
   * Dispose of resources
   */
  dispose() {
    // Call dispose on any instances that support it
    for (const instance of this.instances.values()) {
      if (instance && typeof instance.dispose === 'function') {
        try {
          instance.dispose()
        } catch (error) {
          console.error('Error disposing instance:', error)
        }
      }
    }

    this.reset()
  }
}

// Create and export the global container instance
const container = new Container()

export default container

// Export specific services for convenience
export const getIntegrationService = () => container.resolve('integrationService')
export const getProjectService = () => container.resolve('projectService')
export const getUserService = () => container.resolve('userService')
export const getEnvironmentService = () => container.resolve('environmentService')
export const getSocketService = () => container.resolve('socketService')

// Export container instance for advanced usage
export { container }