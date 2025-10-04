/**
 * Dependency Injection Container
 * Wires together all layers of the application
 */

// Domain
import { AppDefinition } from './domain/entities/AppDefinition.js'

// Application - Use Cases
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
import { ProjectService } from './application/services/ProjectService.js'
import { GitService } from './application/services/GitService.js'

// Infrastructure - Repositories
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
import { ProjectController } from './presentation/controllers/ProjectController.js'
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
    // Use the same instance as test area to ensure consistency
    return this.getTestAreaProcessManager()
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
  getProjectRepository() {
    return this.singleton('projectRepository', () =>
      new FileSystemProjectRepository({ projectPath: this.projectPath })
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
        gitAdapter: this.getGitAdapter()
      })
    )
  }

  // Application Services
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
  getProjectController() {
    return this.singleton('projectController', () =>
      new ProjectController({
        projectService: this.getProjectService(),
        inspectProjectUseCase: this.getInspectProjectUseCase(),
        gitService: this.getDomainGitService()
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