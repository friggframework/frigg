/**
 * Dependency Injection Container
 * Wires together all layers of the application
 */

// Domain
import { Integration } from './domain/entities/Integration.js'
import { APIModule } from './domain/entities/APIModule.js'
import { AppDefinition } from './domain/entities/AppDefinition.js'

// Application - Use Cases
import { ListAPIModulesUseCase } from './application/use-cases/ListAPIModulesUseCase.js'
import { InstallAPIModuleUseCase } from './application/use-cases/InstallAPIModuleUseCase.js'
import { UpdateAPIModuleUseCase } from './application/use-cases/UpdateAPIModuleUseCase.js'
import { DiscoverModulesUseCase } from './application/use-cases/DiscoverModulesUseCase.js'
import { CreateIntegrationUseCase } from './application/use-cases/CreateIntegrationUseCase.js'
import { UpdateIntegrationUseCase } from './application/use-cases/UpdateIntegrationUseCase.js'
import { ListIntegrationsUseCase } from './application/use-cases/ListIntegrationsUseCase.js'
import { DeleteIntegrationUseCase } from './application/use-cases/DeleteIntegrationUseCase.js'
import { StartProjectUseCase } from './application/use-cases/StartProjectUseCase.js'
import { StopProjectUseCase } from './application/use-cases/StopProjectUseCase.js'
import { GetProjectStatusUseCase } from './application/use-cases/GetProjectStatusUseCase.js'
import { InitializeProjectUseCase } from './application/use-cases/InitializeProjectUseCase.js'
import { InspectProjectUseCase } from './application/use-cases/InspectProjectUseCase.js'

// Application - Git Use Cases
import { GetRepositoryStatusUseCase } from './application/use-cases/git/GetRepositoryStatusUseCase.js'
import { CreateBranchUseCase } from './application/use-cases/git/CreateBranchUseCase.js'
import { SwitchBranchUseCase } from './application/use-cases/git/SwitchBranchUseCase.js'
import { DeleteBranchUseCase } from './application/use-cases/git/DeleteBranchUseCase.js'
import { SyncBranchUseCase } from './application/use-cases/git/SyncBranchUseCase.js'

// Application - Services
import { IntegrationService } from './application/services/IntegrationService.js'
import { ProjectService } from './application/services/ProjectService.js'
import { APIModuleService } from './application/services/APIModuleService.js'
import { GitService } from './application/services/GitService.js'

// Infrastructure - Repositories
import { FileSystemIntegrationRepository } from './infrastructure/repositories/FileSystemIntegrationRepository.js'
import { FileSystemAPIModuleRepository } from './infrastructure/repositories/FileSystemAPIModuleRepository.js'
import { FileSystemProjectRepository } from './infrastructure/repositories/FileSystemProjectRepository.js'

// Infrastructure - Adapters
import { FriggCliAdapter } from './infrastructure/adapters/FriggCliAdapter.js'
import { ConfigValidator } from './infrastructure/adapters/ConfigValidator.js'
import { GitAdapter } from './infrastructure/adapters/GitAdapter.js'
import { SimpleGitAdapter } from './infrastructure/persistence/SimpleGitAdapter.js'

// Domain Services
import { ProcessManager } from './domain/services/ProcessManager.js'
import { GitService as DomainGitService } from './domain/services/GitService.js'

// Presentation - Controllers
import { IntegrationController } from './presentation/controllers/IntegrationController.js'
import { ProjectController } from './presentation/controllers/ProjectController.js'
import { APIModuleController } from './presentation/controllers/APIModuleController.js'
import { GitController } from './presentation/controllers/GitController.js'

export class Container {
  constructor({ projectPath = process.cwd(), io = null }) {
    this.projectPath = projectPath
    this.io = io
    this.instances = new Map()
  }

  // Infrastructure Layer
  getFriggCliAdapter() {
    return this.singleton('friggCliAdapter', () =>
      new FriggCliAdapter({ projectPath: this.projectPath })
    )
  }

  getTestAreaProcessManager() {
    return this.singleton('testAreaProcessManager', () => new ProcessManager())
  }

  getProcessManager() {
    return this.singleton('processManager', () => new ProcessManager())
  }

  getWebSocketService() {
    return this.io
  }

  getConfigValidator() {
    return this.singleton('configValidator', () => new ConfigValidator())
  }

  getGitAdapter() {
    return this.singleton('gitAdapter', () =>
      new GitAdapter({ projectPath: this.projectPath })
    )
  }

  getSimpleGitAdapter() {
    return this.singleton('simpleGitAdapter', () =>
      new SimpleGitAdapter()
    )
  }

  // Domain Git Service (new - uses SimpleGitAdapter)
  getDomainGitService() {
    return this.singleton('domainGitService', () =>
      new DomainGitService({
        gitAdapter: this.getSimpleGitAdapter()
      })
    )
  }

  // Repositories
  getIntegrationRepository() {
    return this.singleton('integrationRepository', () =>
      new FileSystemIntegrationRepository({ projectPath: this.projectPath })
    )
  }

  getAPIModuleRepository() {
    return this.singleton('apiModuleRepository', () =>
      new FileSystemAPIModuleRepository({ projectPath: this.projectPath })
    )
  }

  getProjectRepository() {
    return this.singleton('projectRepository', () =>
      new FileSystemProjectRepository({ projectPath: this.projectPath })
    )
  }

  // Use Cases - Integration
  getCreateIntegrationUseCase() {
    return this.singleton('createIntegrationUseCase', () =>
      new CreateIntegrationUseCase({
        integrationRepository: this.getIntegrationRepository(),
        apiModuleRepository: this.getAPIModuleRepository(),
        friggCliAdapter: this.getFriggCliAdapter()
      })
    )
  }

  getUpdateIntegrationUseCase() {
    return this.singleton('updateIntegrationUseCase', () =>
      new UpdateIntegrationUseCase({
        integrationRepository: this.getIntegrationRepository(),
        friggCliAdapter: this.getFriggCliAdapter()
      })
    )
  }

  getListIntegrationsUseCase() {
    return this.singleton('listIntegrationsUseCase', () =>
      new ListIntegrationsUseCase({
        integrationRepository: this.getIntegrationRepository()
      })
    )
  }

  getDeleteIntegrationUseCase() {
    return this.singleton('deleteIntegrationUseCase', () =>
      new DeleteIntegrationUseCase({
        integrationRepository: this.getIntegrationRepository(),
        friggCliAdapter: this.getFriggCliAdapter()
      })
    )
  }

  // Use Cases - API Module
  getListAPIModulesUseCase() {
    return this.singleton('listAPIModulesUseCase', () =>
      new ListAPIModulesUseCase({
        apiModuleRepository: this.getAPIModuleRepository(),
        npmAdapter: this.getFriggCliAdapter() // FriggCliAdapter handles NPM operations
      })
    )
  }

  getInstallAPIModuleUseCase() {
    return this.singleton('installAPIModuleUseCase', () =>
      new InstallAPIModuleUseCase({
        apiModuleRepository: this.getAPIModuleRepository(),
        friggCliAdapter: this.getFriggCliAdapter()
      })
    )
  }

  getUpdateAPIModuleUseCase() {
    return this.singleton('updateAPIModuleUseCase', () =>
      new UpdateAPIModuleUseCase({
        apiModuleRepository: this.getAPIModuleRepository(),
        friggCliAdapter: this.getFriggCliAdapter()
      })
    )
  }

  getDiscoverModulesUseCase() {
    return this.singleton('discoverModulesUseCase', () =>
      new DiscoverModulesUseCase({
        apiModuleRepository: this.getAPIModuleRepository(),
        friggCliAdapter: this.getFriggCliAdapter()
      })
    )
  }

  // Use Cases - Project
  getStartProjectUseCase() {
    return this.singleton('startProjectUseCase', () =>
      new StartProjectUseCase({
        processManager: this.getProcessManager(),
        webSocketService: this.getWebSocketService()
      })
    )
  }

  getStopProjectUseCase() {
    return this.singleton('stopProjectUseCase', () =>
      new StopProjectUseCase({
        processManager: this.getProcessManager(),
        webSocketService: this.getWebSocketService()
      })
    )
  }

  getGetProjectStatusUseCase() {
    return this.singleton('getProjectStatusUseCase', () =>
      new GetProjectStatusUseCase({
        projectRepository: this.getProjectRepository(),
        processManager: this.getProcessManager()
      })
    )
  }

  getInitializeProjectUseCase() {
    return this.singleton('initializeProjectUseCase', () =>
      new InitializeProjectUseCase({
        projectRepository: this.getProjectRepository(),
        friggCliAdapter: this.getFriggCliAdapter(),
        configValidator: this.getConfigValidator()
      })
    )
  }


  getInspectProjectUseCase() {
    return this.singleton('inspectProjectUseCase', () =>
      new InspectProjectUseCase({
        fileSystemProjectRepository: this.getProjectRepository(),
        fileSystemIntegrationRepository: this.getIntegrationRepository(),
        fileSystemAPIModuleRepository: this.getAPIModuleRepository(),
        gitAdapter: this.getGitAdapter()
      })
    )
  }

  // Application Services
  getIntegrationService() {
    return this.singleton('integrationService', () =>
      new IntegrationService({
        createIntegrationUseCase: this.getCreateIntegrationUseCase(),
        updateIntegrationUseCase: this.getUpdateIntegrationUseCase(),
        listIntegrationsUseCase: this.getListIntegrationsUseCase(),
        deleteIntegrationUseCase: this.getDeleteIntegrationUseCase()
      })
    )
  }

  getProjectService() {
    return this.singleton('projectService', () =>
      new ProjectService({
        startProjectUseCase: this.getStartProjectUseCase(),
        stopProjectUseCase: this.getStopProjectUseCase(),
        getProjectStatusUseCase: this.getGetProjectStatusUseCase(),
        initializeProjectUseCase: this.getInitializeProjectUseCase()
      })
    )
  }

  getAPIModuleService() {
    return this.singleton('apiModuleService', () =>
      new APIModuleService({
        listAPIModulesUseCase: this.getListAPIModulesUseCase(),
        installAPIModuleUseCase: this.getInstallAPIModuleUseCase(),
        updateAPIModuleUseCase: this.getUpdateAPIModuleUseCase(),
        discoverModulesUseCase: this.getDiscoverModulesUseCase()
      })
    )
  }

  // Use Cases - Git
  getGetRepositoryStatusUseCase() {
    return this.singleton('getRepositoryStatusUseCase', () =>
      new GetRepositoryStatusUseCase({
        gitAdapter: this.getGitAdapter()
      })
    )
  }

  getCreateBranchUseCase() {
    return this.singleton('createBranchUseCase', () =>
      new CreateBranchUseCase({
        gitAdapter: this.getGitAdapter()
      })
    )
  }

  getSwitchBranchUseCase() {
    return this.singleton('switchBranchUseCase', () =>
      new SwitchBranchUseCase({
        gitAdapter: this.getGitAdapter()
      })
    )
  }

  getDeleteBranchUseCase() {
    return this.singleton('deleteBranchUseCase', () =>
      new DeleteBranchUseCase({
        gitAdapter: this.getGitAdapter()
      })
    )
  }

  getSyncBranchUseCase() {
    return this.singleton('syncBranchUseCase', () =>
      new SyncBranchUseCase({
        gitAdapter: this.getGitAdapter()
      })
    )
  }

  // Git Service
  getGitService() {
    return this.singleton('gitService', () =>
      new GitService({
        getRepositoryStatusUseCase: this.getGetRepositoryStatusUseCase(),
        createBranchUseCase: this.getCreateBranchUseCase(),
        switchBranchUseCase: this.getSwitchBranchUseCase(),
        deleteBranchUseCase: this.getDeleteBranchUseCase(),
        syncBranchUseCase: this.getSyncBranchUseCase()
      })
    )
  }

  // Controllers
  getIntegrationController() {
    return this.singleton('integrationController', () =>
      new IntegrationController({
        integrationService: this.getIntegrationService()
      })
    )
  }

  getProjectController() {
    return this.singleton('projectController', () =>
      new ProjectController({
        projectService: this.getProjectService(),
        inspectProjectUseCase: this.getInspectProjectUseCase(),
        gitService: this.getDomainGitService()
      })
    )
  }

  getAPIModuleController() {
    return this.singleton('apiModuleController', () =>
      new APIModuleController({
        apiModuleService: this.getAPIModuleService()
      })
    )
  }

  getGitController() {
    return this.singleton('gitController', () =>
      new GitController({
        gitService: this.getGitService()
      })
    )
  }

  // Helper method for singleton pattern
  singleton(key, factory) {
    if (!this.instances.has(key)) {
      this.instances.set(key, factory())
    }
    return this.instances.get(key)
  }

  // Cleanup method
  async cleanup() {
    const processManager = this.instances.get('processManager')
    if (processManager) {
      await processManager.cleanup()
    }
  }
}