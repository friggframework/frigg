# RFC: Application Services Layer

**RFC Number**: 0004  
**Title**: Implement Application Services Layer for Use Case Orchestration  
**Status**: Draft  
**Created**: 2025-07-01  
**Author**: Claude Code with SAFLA  
**Dependencies**: RFC 0002 (Domain Layer), RFC 0003 (Repository Pattern)  
**Related**: RFC 0005 (Infrastructure Adapters)

## Summary

This RFC proposes implementing an Application Services layer that orchestrates domain operations and coordinates between different bounded contexts. This layer will handle use cases, manage transactions, and provide a clear API for external consumers.

## Motivation

The current Frigg Framework lacks a clear application layer, resulting in:

1. **Mixed concerns** - Controllers directly manipulate domain entities
2. **Complex coordination** - No single place for use case orchestration  
3. **Transaction management** - Scattered across different layers
4. **Difficult testing** - Business workflows hard to test in isolation
5. **Unclear boundaries** - No defined interface for external consumers

## Detailed Design

### Application Services Architecture

```
packages/core/src/application/
├── services/
│   ├── FriggAppService.ts           # App lifecycle management
│   ├── IntegrationService.ts        # Integration operations
│   ├── ModuleManagementService.ts   # Module installation/updates
│   └── DeploymentService.ts         # App deployment workflows
├── commands/
│   ├── CreateAppCommand.ts          # Command objects
│   ├── ConfigureIntegrationCommand.ts
│   └── DeployAppCommand.ts
├── queries/
│   ├── GetAppDetailsQuery.ts        # Query objects
│   ├── ListIntegrationsQuery.ts
│   └── AppMetricsQuery.ts
├── handlers/
│   ├── command/                     # Command handlers
│   └── query/                       # Query handlers
├── events/
│   ├── DomainEventHandler.ts        # Domain event handling
│   └── IntegrationEventHandler.ts
├── dtos/
│   ├── AppDto.ts                    # Data transfer objects
│   ├── IntegrationDto.ts
│   └── ModuleDto.ts
└── shared/
    ├── ApplicationService.ts        # Base service class
    ├── CommandHandler.ts            # CQRS infrastructure
    └── QueryHandler.ts
```

### Command/Query Separation (CQRS)

#### Command Objects
```typescript
export abstract class Command {
  protected constructor(
    public readonly timestamp: Date = new Date(),
    public readonly correlationId: string = crypto.randomUUID()
  ) {}
}

export class CreateAppCommand extends Command {
  constructor(
    public readonly name: string,
    public readonly userId: string,
    public readonly coreModules: string[],
    public readonly initialIntegrations: CreateIntegrationRequest[] = []
  ) {
    super();
  }
}

export class ConfigureIntegrationCommand extends Command {
  constructor(
    public readonly appId: string,
    public readonly integrationId: string,
    public readonly configuration: IntegrationConfigData,
    public readonly userId: string
  ) {
    super();
  }
}

export class DeployAppCommand extends Command {
  constructor(
    public readonly appId: string,
    public readonly environment: string,
    public readonly deploymentConfig: DeploymentConfigData,
    public readonly userId: string
  ) {
    super();
  }
}
```

#### Query Objects  
```typescript
export abstract class Query {
  protected constructor(
    public readonly timestamp: Date = new Date()
  ) {}
}

export class GetAppDetailsQuery extends Query {
  constructor(
    public readonly appId: string,
    public readonly userId: string,
    public readonly includeMetrics: boolean = false
  ) {
    super();
  }
}

export class ListUserAppsQuery extends Query {
  constructor(
    public readonly userId: string,
    public readonly status?: AppStatus,
    public readonly offset: number = 0,
    public readonly limit: number = 20
  ) {
    super();
  }
}

export class GetIntegrationHealthQuery extends Query {
  constructor(
    public readonly integrationId: string,
    public readonly timePeriod: TimePeriod = TimePeriod.LAST_24_HOURS
  ) {
    super();
  }
}
```

### Application Services Implementation

#### Frigg App Service
```typescript
export class FriggAppService {
  constructor(
    private appRepository: FriggAppRepository,
    private integrationRepository: IntegrationRepository,
    private moduleRepository: ApiModuleRepository,
    private deploymentService: DeploymentService,
    private eventPublisher: DomainEventPublisher,
    private unitOfWork: UnitOfWork
  ) {}

  async createApp(command: CreateAppCommand): Promise<AppCreatedResult> {
    try {
      await this.unitOfWork.begin();
      
      // 1. Validate command
      const validationResult = await this.validateCreateAppCommand(command);
      if (!validationResult.isValid()) {
        throw new ValidationError(validationResult.getErrors());
      }

      // 2. Create domain objects
      const appName = AppName.create(command.name);
      const userId = UserId.create(command.userId);
      const coreModules = await this.resolveCoreModules(command.coreModules);
      
      // 3. Create app through domain
      const app = FriggApp.create(appName, Version.create('1.0.0'), coreModules);
      app.assignToUser(userId);

      // 4. Add initial integrations
      for (const integrationRequest of command.initialIntegrations) {
        const integration = await this.createIntegrationForApp(app, integrationRequest);
        app.addIntegration(integration);
      }

      // 5. Persist changes
      await this.appRepository.save(app);
      
      // 6. Publish events
      await this.publishDomainEvents(app);
      
      await this.unitOfWork.commit();
      
      return AppCreatedResult.success(
        app.getId().getValue(),
        app.getName().getValue(),
        app.getIntegrations().count()
      );
      
    } catch (error) {
      await this.unitOfWork.rollback();
      throw error;
    }
  }

  async configureIntegration(command: ConfigureIntegrationCommand): Promise<void> {
    const app = await this.getAppByIdOrThrow(AppId.create(command.appId));
    const integration = app.getIntegration(IntegrationId.create(command.integrationId));
    
    if (!integration) {
      throw new NotFoundError('Integration not found');
    }

    // Validate user has permission
    await this.ensureUserCanModifyApp(UserId.create(command.userId), app);
    
    // Configure through domain
    const config = IntegrationConfig.create(command.configuration);
    integration.configure(config);
    
    // Validate configuration
    const validationService = new IntegrationValidationService();
    const validationResult = validationService.validateIntegrationConfig(integration, config);
    
    if (!validationResult.isValid()) {
      throw new ValidationError(`Configuration invalid: ${validationResult.getErrors()}`);
    }

    // Persist and publish events
    await this.appRepository.save(app);
    await this.publishDomainEvents(app);
  }

  async deployApp(command: DeployAppCommand): Promise<DeploymentResult> {
    const app = await this.getAppByIdOrThrow(AppId.create(command.appId));
    
    // Validate deployment readiness
    const deploymentValidation = await this.validateDeploymentReadiness(app);
    if (!deploymentValidation.isValid()) {
      throw new DeploymentError(deploymentValidation.getErrors());
    }
    
    // Deploy through infrastructure service
    const deploymentConfig = DeploymentConfig.create(command.deploymentConfig);
    const result = await this.deploymentService.deploy(app, deploymentConfig);
    
    // Update app status
    app.markAsDeployed(result.getEnvironment(), result.getDeploymentUrl());
    await this.appRepository.save(app);
    
    return result;
  }

  private async validateCreateAppCommand(command: CreateAppCommand): Promise<ValidationResult> {
    const errors: string[] = [];
    
    // Business validation
    if (await this.appRepository.findByName(AppName.create(command.name))) {
      errors.push('App name must be unique');
    }
    
    // Core modules validation
    const moduleValidation = await this.validateCoreModules(command.coreModules);
    errors.push(...moduleValidation.getErrors());
    
    return ValidationResult.create(errors);
  }
}
```

#### Integration Service
```typescript
export class IntegrationService {
  constructor(
    private integrationRepository: IntegrationRepository,
    private moduleRepository: ApiModuleRepository,
    private connectionTestService: ConnectionTestService,
    private eventPublisher: DomainEventPublisher
  ) {}

  async createIntegration(command: CreateIntegrationCommand): Promise<IntegrationCreatedResult> {
    // 1. Resolve API modules
    const apiModules = await this.resolveApiModules(command.moduleIds);
    
    // 2. Create integration through domain
    const integration = Integration.create(
      IntegrationName.create(command.name),
      IntegrationType.create(command.type),
      IntegrationConfig.create(command.initialConfig)
    );
    
    // 3. Add API modules
    for (const module of apiModules) {
      integration.addApiModule(module);
    }
    
    // 4. Persist and return result
    await this.integrationRepository.save(integration);
    await this.publishDomainEvents(integration);
    
    return IntegrationCreatedResult.success(integration.getId().getValue());
  }

  async testConnection(command: TestConnectionCommand): Promise<ConnectionTestResult> {
    const integration = await this.getIntegrationByIdOrThrow(
      IntegrationId.create(command.integrationId)
    );
    
    // Test through domain service
    const testResult = await this.connectionTestService.testIntegration(integration);
    
    // Update integration status based on test
    if (testResult.isSuccessful()) {
      integration.markConnectionValid();
    } else {
      integration.markConnectionInvalid(testResult.getErrorMessage());
    }
    
    await this.integrationRepository.save(integration);
    
    return testResult;
  }

  async activateIntegration(command: ActivateIntegrationCommand): Promise<void> {
    const integration = await this.getIntegrationByIdOrThrow(
      IntegrationId.create(command.integrationId)
    );
    
    // Activate through domain (includes business rule validation)
    integration.activate();
    
    await this.integrationRepository.save(integration);
    await this.publishDomainEvents(integration);
  }
}
```

### Query Handlers (Read Side)

```typescript
export class AppQueryHandler {
  constructor(
    private appQueryRepository: FriggAppQueryRepository,
    private integrationQueryRepository: IntegrationQueryRepository
  ) {}

  async handle(query: GetAppDetailsQuery): Promise<AppDetailsDto> {
    const app = await this.appQueryRepository.findById(AppId.create(query.appId));
    if (!app) {
      throw new NotFoundError('App not found');
    }

    // Build read model
    const dto = AppDetailsDto.fromReadModel(app);
    
    // Optionally include metrics
    if (query.includeMetrics) {
      const metrics = await this.appQueryRepository.findAppMetrics(AppId.create(query.appId));
      dto.metrics = AppMetricsDto.fromDomain(metrics);
    }
    
    return dto;
  }

  async handle(query: ListUserAppsQuery): Promise<PaginatedResult<AppSummaryDto>> {
    const apps = await this.appQueryRepository.findAppSummariesByUser(
      UserId.create(query.userId),
      query.offset,
      query.limit,
      query.status
    );
    
    const totalCount = await this.appQueryRepository.countByUser(
      UserId.create(query.userId),
      query.status
    );
    
    return PaginatedResult.create(
      apps.map(app => AppSummaryDto.fromReadModel(app)),
      totalCount,
      query.offset,
      query.limit
    );
  }
}
```

### Domain Event Handling

```typescript
export class IntegrationEventHandler {
  constructor(
    private notificationService: NotificationService,
    private analyticsService: AnalyticsService,
    private auditService: AuditService
  ) {}

  @EventHandler(IntegrationActivated)
  async onIntegrationActivated(event: IntegrationActivated): Promise<void> {
    // Send notification
    await this.notificationService.notifyIntegrationActivated(
      event.integrationId,
      event.userId
    );
    
    // Track analytics
    await this.analyticsService.trackEvent('integration.activated', {
      integrationId: event.integrationId.getValue(),
      integrationType: event.integrationType.getValue()
    });
    
    // Audit trail
    await this.auditService.logIntegrationEvent({
      action: 'ACTIVATION',
      integrationId: event.integrationId.getValue(),
      userId: event.userId?.getValue(),
      timestamp: event.occurredOn
    });
  }

  @EventHandler(IntegrationConfigured)
  async onIntegrationConfigured(event: IntegrationConfigured): Promise<void> {
    // Validate configuration asynchronously
    const validationService = new IntegrationValidationService();
    const result = await validationService.validateConfigurationAsync(
      event.integrationId,
      event.config
    );
    
    if (!result.isValid()) {
      // Publish validation failed event
      await this.eventPublisher.publish(
        new IntegrationValidationFailed(event.integrationId, result.getErrors())
      );
    }
  }
}
```

### Data Transfer Objects (DTOs)

```typescript
export class AppDetailsDto {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly version: string,
    public readonly status: string,
    public readonly integrations: IntegrationSummaryDto[],
    public readonly coreModules: ModuleSummaryDto[],
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly metrics?: AppMetricsDto
  ) {}

  static fromReadModel(app: FriggAppReadModel): AppDetailsDto {
    return new AppDetailsDto(
      app.id,
      app.name,
      app.version,
      app.status,
      app.integrations.map(i => IntegrationSummaryDto.fromReadModel(i)),
      app.coreModules.map(m => ModuleSummaryDto.fromReadModel(m)),
      app.createdAt,
      app.updatedAt
    );
  }
}

export class IntegrationSummaryDto {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly type: string,
    public readonly status: string,
    public readonly lastSyncAt?: Date,
    public readonly healthStatus?: 'healthy' | 'degraded' | 'unhealthy'
  ) {}
}
```

## Implementation Plan

### Phase 1: CQRS Infrastructure (Week 1)
- [ ] Create command/query base classes
- [ ] Implement command and query handlers
- [ ] Set up event handling infrastructure
- [ ] Add validation framework

### Phase 2: Core Application Services (Week 2)
- [ ] Implement FriggAppService with key operations
- [ ] Implement IntegrationService
- [ ] Add transaction management with Unit of Work
- [ ] Create comprehensive service tests

### Phase 3: Query Handlers and DTOs (Week 3)
- [ ] Implement read-side query handlers
- [ ] Create data transfer objects
- [ ] Add query optimization
- [ ] Integration tests for full workflows

### Phase 4: Event Handling (Week 4)
- [ ] Implement domain event handlers
- [ ] Add cross-cutting concerns (notifications, analytics)
- [ ] Performance monitoring and logging
- [ ] End-to-end testing

## Testing Strategy

### Application Service Testing
```typescript
describe('FriggAppService', () => {
  let service: FriggAppService;
  let mockAppRepo: jest.Mocked<FriggAppRepository>;
  let mockUnitOfWork: jest.Mocked<UnitOfWork>;
  
  beforeEach(() => {
    mockAppRepo = createMockAppRepository();
    mockUnitOfWork = createMockUnitOfWork();
    service = new FriggAppService(mockAppRepo, /*...other deps*/);
  });

  describe('createApp', () => {
    it('should create app successfully', async () => {
      const command = new CreateAppCommand('Test App', 'user-123', ['auth', 'db']);
      
      const result = await service.createApp(command);
      
      expect(result.isSuccess()).toBe(true);
      expect(mockAppRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.objectContaining({ value: 'Test App' })
        })
      );
      expect(mockUnitOfWork.commit).toHaveBeenCalled();
    });

    it('should rollback on validation error', async () => {
      mockAppRepo.findByName.mockResolvedValue(createExistingApp());
      const command = new CreateAppCommand('Existing App', 'user-123', []);
      
      await expect(service.createApp(command))
        .rejects.toThrow('App name must be unique');
      
      expect(mockUnitOfWork.rollback).toHaveBeenCalled();
    });
  });
});
```

### Integration Testing
```typescript
describe('App Creation Workflow', () => {
  it('should create app with integrations end-to-end', async () => {
    // Given: Valid create app command
    const command = new CreateAppCommand('E2E Test App', 'user-123', ['auth'], [
      { name: 'Salesforce', type: 'CRM', modules: ['salesforce-api'] }
    ]);
    
    // When: Creating app through service
    const result = await appService.createApp(command);
    
    // Then: App should be created and persisted
    expect(result.isSuccess()).toBe(true);
    
    const savedApp = await appRepository.findById(AppId.create(result.appId));
    expect(savedApp).toBeDefined();
    expect(savedApp.getIntegrations().count()).toBe(1);
    
    // And: Events should be published
    expect(eventPublisher.publishedEvents).toContain(
      expect.objectContaining({ eventName: 'app.created' })
    );
  });
});
```

## Migration Strategy

### Gradual Service Migration
1. **Create services alongside existing controllers**
2. **Migrate complex workflows first**
3. **Update controllers to delegate to services**
4. **Remove business logic from controllers**

### Controller Adaptation Pattern
```typescript
// Before: Controller with business logic
export class AppController {
  async createApp(req, res) {
    // Business logic mixed with HTTP concerns
    const app = new App(req.body);
    await app.save();
    res.json({ id: app.id });
  }
}

// After: Controller delegates to application service
export class AppController {
  constructor(private appService: FriggAppService) {}
  
  async createApp(req, res) {
    try {
      const command = new CreateAppCommand(
        req.body.name,
        req.user.id,
        req.body.coreModules
      );
      
      const result = await this.appService.createApp(command);
      
      res.json({ 
        id: result.appId,
        success: true 
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }
}
```

## Success Metrics

- **Clean separation**: No business logic in controllers/handlers
- **Test coverage**: 95% for application services
- **Performance**: Command processing under 500ms
- **Reliability**: Transaction rollback on any failure

## Security Considerations

- Command validation prevents invalid operations
- Authorization checks in application services
- Audit trail through domain events
- Input sanitization in DTOs

## Future Considerations

This RFC enables:
- Microservices decomposition along service boundaries
- API versioning through command/query evolution
- Advanced workflows with saga patterns
- Real-time updates through event streaming