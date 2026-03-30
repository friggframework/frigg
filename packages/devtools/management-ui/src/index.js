/**
 * Main exports for the DDD/Hexagonal Architecture
 * This file provides easy access to the main application services and entities
 */

// Domain Entities
export { Integration } from './domain/entities/Integration.js'
export { APIModule } from './domain/entities/APIModule.js'
export { Project } from './domain/entities/Project.js'
export { User } from './domain/entities/User.js'
export { Environment } from './domain/entities/Environment.js'

// Domain Value Objects
export { IntegrationStatus } from './domain/value-objects/IntegrationStatus.js'
export { ServiceStatus } from './domain/value-objects/ServiceStatus.js'

// Domain Interfaces (Ports)
export { IntegrationRepository } from './domain/interfaces/IntegrationRepository.js'
export { ProjectRepository } from './domain/interfaces/ProjectRepository.js'
export { UserRepository } from './domain/interfaces/UserRepository.js'
export { EnvironmentRepository } from './domain/interfaces/EnvironmentRepository.js'
export { SessionRepository } from './domain/interfaces/SessionRepository.js'
export { SocketService } from './domain/interfaces/SocketService.js'

// Application Services
export { IntegrationService } from './application/services/IntegrationService.js'
export { ProjectService } from './application/services/ProjectService.js'
export { UserService } from './application/services/UserService.js'
export { EnvironmentService } from './application/services/EnvironmentService.js'

// Use Cases
export { ListIntegrationsUseCase } from './application/use-cases/ListIntegrationsUseCase.js'
export { InstallIntegrationUseCase } from './application/use-cases/InstallIntegrationUseCase.js'
export { GetProjectStatusUseCase } from './application/use-cases/GetProjectStatusUseCase.js'
export { StartProjectUseCase } from './application/use-cases/StartProjectUseCase.js'
export { StopProjectUseCase } from './application/use-cases/StopProjectUseCase.js'
export { SwitchRepositoryUseCase } from './application/use-cases/SwitchRepositoryUseCase.js'

// Infrastructure Adapters
export { IntegrationRepositoryAdapter } from './infrastructure/adapters/IntegrationRepositoryAdapter.js'
export { ProjectRepositoryAdapter } from './infrastructure/adapters/ProjectRepositoryAdapter.js'
export { UserRepositoryAdapter } from './infrastructure/adapters/UserRepositoryAdapter.js'
export { EnvironmentRepositoryAdapter } from './infrastructure/adapters/EnvironmentRepositoryAdapter.js'
export { SessionRepositoryAdapter } from './infrastructure/adapters/SessionRepositoryAdapter.js'
export { SocketServiceAdapter } from './infrastructure/adapters/SocketServiceAdapter.js'

// Dependency Injection Container
export { default as container, getIntegrationService, getProjectService, getUserService, getEnvironmentService, getSocketService } from './container.js'

// Presentation Layer
export { useFrigg, FriggProvider } from './presentation/hooks/useFrigg.jsx'

// Hooks
export { useIntegrations } from './hooks/useIntegrations.js'
export { useRepositories } from './hooks/useRepositories.js'