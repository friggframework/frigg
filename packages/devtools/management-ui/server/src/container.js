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

// Application - Project Use Cases
import { FindProjectByIdUseCase } from './application/use-cases/project/FindProjectByIdUseCase.js'
import { ListRepositoriesUseCase } from './application/use-cases/project/ListRepositoriesUseCase.js'
import { SwitchRepositoryUseCase } from './application/use-cases/project/SwitchRepositoryUseCase.js'
import { GetGitBranchesUseCase } from './application/use-cases/project/GetGitBranchesUseCase.js'
import { SwitchGitBranchUseCase } from './application/use-cases/project/SwitchGitBranchUseCase.js'

// Application - IDE Use Cases
import { ListAvailableIDEsUseCase } from './application/use-cases/ide/ListAvailableIDEsUseCase.js'
import { OpenInIDEUseCase } from './application/use-cases/ide/OpenInIDEUseCase.js'

// Application - Git Use Cases
import { GetRepositoryStatusUseCase } from './application/use-cases/git/GetRepositoryStatusUseCase.js'
import { CreateBranchUseCase } from './application/use-cases/git/CreateBranchUseCase.js'
import { SwitchBranchUseCase } from './application/use-cases/git/SwitchBranchUseCase.js'
import { DeleteBranchUseCase } from './application/use-cases/git/DeleteBranchUseCase.js'
import { SyncBranchUseCase } from './application/use-cases/git/SyncBranchUseCase.js'

// Application - AI Use Cases
import { StartAgentSessionUseCase } from './application/use-cases/ai/StartAgentSessionUseCase.js'
import { StopAgentSessionUseCase } from './application/use-cases/ai/StopAgentSessionUseCase.js'
import { GetAgentSessionStatusUseCase } from './application/use-cases/ai/GetAgentSessionStatusUseCase.js'
import { ApproveProposalUseCase } from './application/use-cases/ai/ApproveProposalUseCase.js'
import { RejectProposalUseCase } from './application/use-cases/ai/RejectProposalUseCase.js'
import { RollbackProposalUseCase } from './application/use-cases/ai/RollbackProposalUseCase.js'

// Application - Chat Session Use Cases
import { SaveChatSessionUseCase } from './application/use-cases/chat/SaveChatSessionUseCase.js'
import { GetChatSessionUseCase } from './application/use-cases/chat/GetChatSessionUseCase.js'
import { ListChatSessionsUseCase } from './application/use-cases/chat/ListChatSessionsUseCase.js'
import { DeleteChatSessionUseCase } from './application/use-cases/chat/DeleteChatSessionUseCase.js'

// Application - Frigg App Use Cases
import { ConnectToFriggAppUseCase } from './application/use-cases/frigg-app/ConnectToFriggAppUseCase.js'
import { AutoConnectUseCase } from './application/use-cases/frigg-app/AutoConnectUseCase.js'
import { GetUserManagementModeUseCase } from './application/use-cases/frigg-app/GetUserManagementModeUseCase.js'
import { ManageGlobalEntitiesUseCase } from './application/use-cases/frigg-app/ManageGlobalEntitiesUseCase.js'
import { SharedSecretProxyUseCase } from './application/use-cases/frigg-app/SharedSecretProxyUseCase.js'

// Application - Services
import { ProjectService } from './application/services/ProjectService.js'
import { GitService } from './application/services/GitService.js'

// Infrastructure - Repositories
import { FileSystemProjectRepository } from './infrastructure/repositories/FileSystemProjectRepository.js'
import { EnvironmentProjectRepository } from './infrastructure/repositories/EnvironmentProjectRepository.js'
import { IDERepository } from './infrastructure/repositories/IDERepository.js'

// Infrastructure - Adapters
import { FriggCliAdapter } from './infrastructure/adapters/FriggCliAdapter.js'
import { ConfigValidator } from './infrastructure/adapters/ConfigValidator.js'
import { GitAdapter } from './infrastructure/adapters/GitAdapter.js'
import { SimpleGitAdapter } from './infrastructure/persistence/SimpleGitAdapter.js'
import { ClaudeAgentAdapter } from './infrastructure/adapters/ClaudeAgentAdapter.js'
import { FileSystemAdapter } from './infrastructure/adapters/FileSystemAdapter.js'
import axios from 'axios'
import { FriggAppHttpAdapter } from './infrastructure/adapters/FriggAppHttpAdapter.js'
import { FriggAdminApiAdapter } from './infrastructure/adapters/FriggAdminApiAdapter.js'
import { EnvFileReader } from './infrastructure/adapters/EnvFileReader.js'

// Infrastructure - Repositories
import { InMemoryProposalRepository } from './infrastructure/repositories/InMemoryProposalRepository.js'
import { ChatSessionRepository } from './infrastructure/repositories/ChatSessionRepository.js'
import { SettingsRepository } from './infrastructure/repositories/SettingsRepository.js'

// Domain Services
import { ProcessManager } from './domain/services/ProcessManager.js'
import { GitService as DomainGitService } from './domain/services/GitService.js'

// Presentation - Controllers
import { ProjectController } from './presentation/controllers/ProjectController.js'
import { GitController } from './presentation/controllers/GitController.js'
import { FriggAppController } from './presentation/controllers/FriggAppController.js'

// Presentation - WebSocket Handlers
import { setupAgentHandlers } from './presentation/websocket/agentHandlers.js'
import { setupChatSessionHandlers } from './presentation/websocket/chatSessionHandlers.js'
import { setupTestAreaHandlers } from './presentation/websocket/testAreaHandlers.js'

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
        webSocketService: this.getWebSocketService(),
        findProjectByIdUseCase: this.getFindProjectByIdUseCase()
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

  // Environment Project Repository (for repository discovery from env vars)
  getEnvironmentProjectRepository() {
    return this.singleton('environmentProjectRepository', () =>
      new EnvironmentProjectRepository({ projectPath: this.projectPath })
    )
  }

  // IDE Repository
  getIDERepository() {
    return this.singleton('ideRepository', () => new IDERepository())
  }

  // Project-specific Use Cases
  getFindProjectByIdUseCase() {
    return this.singleton('findProjectByIdUseCase', () =>
      new FindProjectByIdUseCase({
        projectRepository: this.getEnvironmentProjectRepository()
      })
    )
  }

  getListRepositoriesUseCase() {
    return this.singleton('listRepositoriesUseCase', () =>
      new ListRepositoriesUseCase({
        projectRepository: this.getEnvironmentProjectRepository()
      })
    )
  }

  getSwitchRepositoryUseCase() {
    return this.singleton('switchRepositoryUseCase', () =>
      new SwitchRepositoryUseCase({
        projectRepository: this.getEnvironmentProjectRepository()
      })
    )
  }

  getGetGitBranchesUseCase() {
    return this.singleton('getGitBranchesUseCase', () =>
      new GetGitBranchesUseCase({
        gitAdapter: this.getSimpleGitAdapter()
      })
    )
  }

  getSwitchGitBranchUseCase() {
    return this.singleton('switchGitBranchUseCase', () =>
      new SwitchGitBranchUseCase({
        gitAdapter: this.getSimpleGitAdapter()
      })
    )
  }

  // IDE Use Cases
  getListAvailableIDEsUseCase() {
    return this.singleton('listAvailableIDEsUseCase', () =>
      new ListAvailableIDEsUseCase({
        ideRepository: this.getIDERepository()
      })
    )
  }

  getOpenInIDEUseCase() {
    return this.singleton('openInIDEUseCase', () =>
      new OpenInIDEUseCase({
        ideRepository: this.getIDERepository(),
        gitAdapter: this.getSimpleGitAdapter()
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
        gitService: this.getDomainGitService(),
        // New use cases for DDD compliance
        findProjectByIdUseCase: this.getFindProjectByIdUseCase(),
        listRepositoriesUseCase: this.getListRepositoriesUseCase(),
        switchRepositoryUseCase: this.getSwitchRepositoryUseCase(),
        getGitBranchesUseCase: this.getGetGitBranchesUseCase(),
        switchGitBranchUseCase: this.getSwitchGitBranchUseCase(),
        listAvailableIDEsUseCase: this.getListAvailableIDEsUseCase(),
        openInIDEUseCase: this.getOpenInIDEUseCase()
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

  // ============================================
  // Frigg App Connection (Admin API)
  // ============================================

  // Settings Repository (for caching connection settings)
  getSettingsRepository() {
    return this.singleton('settingsRepository', () =>
      new SettingsRepository()
    )
  }

  // HTTP Client for external requests
  getHttpClient() {
    return this.singleton('httpClient', () =>
      axios.create({
        timeout: 30000,
        validateStatus: (status) => status < 500
      })
    )
  }

  // Frigg App HTTP Adapter
  getFriggAppHttpAdapter() {
    return this.singleton('friggAppHttpAdapter', () =>
      new FriggAppHttpAdapter({
        httpClient: this.getHttpClient()
      })
    )
  }

  // Frigg Admin API Adapter
  getFriggAdminApiAdapter() {
    return this.singleton('friggAdminApiAdapter', () =>
      new FriggAdminApiAdapter({
        friggAppAdapter: this.getFriggAppHttpAdapter()
      })
    )
  }

  // Use Cases - Frigg App
  getEnvFileReader() {
    return this.singleton('envFileReader', () => new EnvFileReader())
  }

  getConnectToFriggAppUseCase() {
    return this.singleton('connectToFriggAppUseCase', () =>
      new ConnectToFriggAppUseCase({
        friggAppAdapter: this.getFriggAppHttpAdapter(),
        settingsRepository: this.getSettingsRepository()
      })
    )
  }

  getAutoConnectUseCase() {
    return this.singleton('autoConnectUseCase', () =>
      new AutoConnectUseCase({
        connectToFriggAppUseCase: this.getConnectToFriggAppUseCase(),
        envFileReader: this.getEnvFileReader()
      })
    )
  }

  getGetUserManagementModeUseCase() {
    return this.singleton('getUserManagementModeUseCase', () =>
      new GetUserManagementModeUseCase({
        friggAppAdapter: this.getFriggAppHttpAdapter()
      })
    )
  }

  getManageGlobalEntitiesUseCase() {
    return this.singleton('manageGlobalEntitiesUseCase', () =>
      new ManageGlobalEntitiesUseCase({
        adminApiAdapter: this.getFriggAdminApiAdapter()
      })
    )
  }

  getSharedSecretProxyUseCase() {
    return this.singleton('sharedSecretProxyUseCase', () =>
      new SharedSecretProxyUseCase({
        connectionStateService: this.getFriggAppHttpAdapter(),
        envFileReader: this.getEnvFileReader(),
        httpClient: this.getHttpClient()
      })
    )
  }

  getFriggAppController() {
    return this.singleton('friggAppController', () =>
      new FriggAppController({
        connectToFriggAppUseCase: this.getConnectToFriggAppUseCase(),
        autoConnectUseCase: this.getAutoConnectUseCase(),
        getUserManagementModeUseCase: this.getGetUserManagementModeUseCase(),
        manageGlobalEntitiesUseCase: this.getManageGlobalEntitiesUseCase(),
        adminApiAdapter: this.getFriggAdminApiAdapter(),
        sharedSecretProxyUseCase: this.getSharedSecretProxyUseCase()
      })
    )
  }

  // AI Agent Adapter
  getClaudeAgentAdapter() {
    return this.singleton('claudeAgentAdapter', () =>
      new ClaudeAgentAdapter({ projectPath: this.projectPath })
    )
  }

  // AI Use Cases
  getStartAgentSessionUseCase() {
    return this.singleton('startAgentSessionUseCase', () =>
      new StartAgentSessionUseCase({
        claudeAgentAdapter: this.getClaudeAgentAdapter(),
        webSocketService: this.getWebSocketService()
      })
    )
  }

  getStopAgentSessionUseCase() {
    return this.singleton('stopAgentSessionUseCase', () =>
      new StopAgentSessionUseCase({
        claudeAgentAdapter: this.getClaudeAgentAdapter()
      })
    )
  }

  getGetAgentSessionStatusUseCase() {
    return this.singleton('getAgentSessionStatusUseCase', () =>
      new GetAgentSessionStatusUseCase({
        claudeAgentAdapter: this.getClaudeAgentAdapter()
      })
    )
  }

  // Proposal Repository
  getProposalRepository() {
    return this.singleton('proposalRepository', () =>
      new InMemoryProposalRepository()
    )
  }

  // FileSystem Adapter
  getFileSystemAdapter() {
    return this.singleton('fileSystemAdapter', () =>
      new FileSystemAdapter({ projectPath: this.projectPath })
    )
  }

  // Proposal Use Cases
  getApproveProposalUseCase() {
    return this.singleton('approveProposalUseCase', () =>
      new ApproveProposalUseCase({
        proposalRepository: this.getProposalRepository(),
        fileSystemAdapter: this.getFileSystemAdapter()
      })
    )
  }

  getRejectProposalUseCase() {
    return this.singleton('rejectProposalUseCase', () =>
      new RejectProposalUseCase({
        proposalRepository: this.getProposalRepository()
      })
    )
  }

  getRollbackProposalUseCase() {
    return this.singleton('rollbackProposalUseCase', () =>
      new RollbackProposalUseCase({
        proposalRepository: this.getProposalRepository(),
        fileSystemAdapter: this.getFileSystemAdapter()
      })
    )
  }

  // Chat Session Repository Factory
  // Creates a repository instance for a specific project path
  // This is a factory, not a singleton, because each project has its own storage
  getChatSessionRepository(projectPath) {
    return new ChatSessionRepository({ projectPath })
  }

  // Chat Session Use Case Factories
  // These return factory functions that take a repository instance
  // This allows creating use cases dynamically per project path
  getSaveChatSessionUseCaseFactory() {
    return (repository) => new SaveChatSessionUseCase({ chatSessionRepository: repository })
  }

  getGetChatSessionUseCaseFactory() {
    return (repository) => new GetChatSessionUseCase({ chatSessionRepository: repository })
  }

  getListChatSessionsUseCaseFactory() {
    return (repository) => new ListChatSessionsUseCase({ chatSessionRepository: repository })
  }

  getDeleteChatSessionUseCaseFactory() {
    return (repository) => new DeleteChatSessionUseCase({ chatSessionRepository: repository })
  }

  // Setup WebSocket handlers for AI agents
  setupAgentWebSocketHandlers() {
    if (this.io) {
      setupAgentHandlers({
        io: this.io,
        startAgentSessionUseCase: this.getStartAgentSessionUseCase(),
        stopAgentSessionUseCase: this.getStopAgentSessionUseCase(),
        getAgentSessionStatusUseCase: this.getGetAgentSessionStatusUseCase(),
        claudeAgentAdapter: this.getClaudeAgentAdapter(),
        approveProposalUseCase: this.getApproveProposalUseCase(),
        rejectProposalUseCase: this.getRejectProposalUseCase(),
        rollbackProposalUseCase: this.getRollbackProposalUseCase()
      })

      // Setup chat session handlers
      setupChatSessionHandlers({
        io: this.io,
        getRepositoryForSession: (projectPath) => this.getChatSessionRepository(projectPath),
        saveChatSessionUseCase: this.getSaveChatSessionUseCaseFactory(),
        getChatSessionUseCase: this.getGetChatSessionUseCaseFactory(),
        listChatSessionsUseCase: this.getListChatSessionsUseCaseFactory(),
        deleteChatSessionUseCase: this.getDeleteChatSessionUseCaseFactory()
      })

      // Setup test area handlers for CLI prompt interaction
      setupTestAreaHandlers({
        io: this.io,
        processManager: this.getProcessManager()
      })
    }
    return this
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

    const claudeAgentAdapter = this.instances.get('claudeAgentAdapter')
    if (claudeAgentAdapter) {
      await claudeAgentAdapter.cleanup()
    }
  }
}