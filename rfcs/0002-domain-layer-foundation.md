# RFC: Domain Layer Foundation - DDD Implementation

**RFC Number**: 0002  
**Title**: Implement Domain-Driven Design Foundation Layer  
**Status**: Draft  
**Created**: 2025-07-01  
**Author**: Claude Code with SAFLA  
**Dependencies**: None
**Related**: RFC 0003 (Repository Pattern)

## Summary

This RFC proposes implementing a Domain-Driven Design (DDD) foundation layer for the Frigg Framework. This establishes the core domain model with proper entities, value objects, and domain services that represent the business logic independent of technical concerns.

## Motivation

The current Frigg Framework architecture mixes business logic with infrastructure concerns, making it difficult to:

1. **Understand business rules** - Logic is scattered across multiple layers
2. **Test business logic** - Tightly coupled to database and external services  
3. **Extend functionality** - New features require touching multiple unrelated files
4. **Maintain consistency** - No single source of truth for business rules

## Detailed Design

### Domain Model Structure

```
packages/core/src/domain/
├── entities/
│   ├── FriggApp.ts
│   ├── Integration.ts
│   └── ApiModule.ts
├── value-objects/
│   ├── AppId.ts
│   ├── IntegrationConfig.ts
│   └── ModuleVersion.ts
├── services/
│   ├── AppOrchestrationService.ts
│   └── IntegrationValidationService.ts
├── events/
│   ├── AppCreated.ts
│   └── IntegrationConfigured.ts
└── shared/
    ├── ValueObject.ts
    └── Entity.ts
```

### Core Domain Entities

#### Frigg App Entity
```typescript
export class FriggApp extends Entity<AppId> {
  private constructor(
    id: AppId,
    private name: AppName,
    private version: Version,
    private integrations: IntegrationCollection,
    private coreModules: CoreModuleCollection,
    private extensions: AppExtensionCollection
  ) {
    super(id);
  }

  static create(
    name: AppName,
    version: Version,
    coreModules: CoreModuleCollection
  ): FriggApp {
    const id = AppId.generate();
    const app = new FriggApp(id, name, version, 
      IntegrationCollection.empty(), coreModules, 
      AppExtensionCollection.empty()
    );
    
    app.addDomainEvent(new AppCreated(id, name));
    return app;
  }

  addIntegration(integration: Integration): void {
    this.validateIntegrationCompatibility(integration);
    this.integrations.add(integration);
    this.addDomainEvent(new IntegrationAdded(this.id, integration.getId()));
  }

  private validateIntegrationCompatibility(integration: Integration): void {
    if (!this.coreModules.supportsIntegrationType(integration.getType())) {
      throw new DomainError('Integration type not supported by core modules');
    }
  }
}
```

#### Integration Entity
```typescript
export class Integration extends Entity<IntegrationId> {
  private constructor(
    id: IntegrationId,
    private name: IntegrationName,
    private type: IntegrationType,
    private config: IntegrationConfig,
    private apiModules: ApiModuleCollection,
    private status: IntegrationStatus
  ) {
    super(id);
  }

  static create(
    name: IntegrationName,
    type: IntegrationType,
    config: IntegrationConfig
  ): Integration {
    const id = IntegrationId.generate();
    const integration = new Integration(id, name, type, config,
      ApiModuleCollection.empty(), IntegrationStatus.DRAFT
    );
    
    integration.addDomainEvent(new IntegrationCreated(id, name, type));
    return integration;
  }

  configure(config: IntegrationConfig): void {
    const validationResult = this.validateConfiguration(config);
    if (!validationResult.isValid()) {
      throw new DomainError(`Configuration invalid: ${validationResult.getErrors()}`);
    }
    
    this.config = config;
    this.addDomainEvent(new IntegrationConfigured(this.id, config));
  }

  activate(): void {
    if (!this.canActivate()) {
      throw new DomainError('Integration cannot be activated in current state');
    }
    
    this.status = IntegrationStatus.ACTIVE;
    this.addDomainEvent(new IntegrationActivated(this.id));
  }

  private canActivate(): boolean {
    return this.status === IntegrationStatus.CONFIGURED &&
           this.config.isComplete() &&
           this.apiModules.hasRequiredModules();
  }
}
```

### Value Objects

#### Base Value Object
```typescript
export abstract class ValueObject<T> {
  protected constructor(protected readonly value: T) {
    this.validate(value);
  }

  protected abstract validate(value: T): void;

  getValue(): T {
    return this.value;
  }

  equals(other: ValueObject<T>): boolean {
    return this.value === other.value;
  }
}
```

#### Domain Value Objects
```typescript
export class AppId extends ValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): AppId {
    return new AppId(value);
  }

  static generate(): AppId {
    return new AppId(`app-${crypto.randomUUID()}`);
  }

  protected validate(value: string): void {
    if (!value || value.trim().length === 0) {
      throw new DomainError('AppId cannot be empty');
    }
    if (!/^app-[a-zA-Z0-9-]{1,50}$/.test(value)) {
      throw new DomainError('AppId must match format: app-{alphanumeric-dashes}');
    }
  }
}

export class IntegrationConfig extends ValueObject<ConfigurationData> {
  private constructor(value: ConfigurationData) {
    super(value);
  }

  static create(data: ConfigurationData): IntegrationConfig {
    return new IntegrationConfig(data);
  }

  isComplete(): boolean {
    return this.value.authConfig?.isValid() && 
           this.value.endpointConfig?.isValid();
  }

  protected validate(value: ConfigurationData): void {
    if (!value.authConfig) {
      throw new DomainError('Authentication configuration is required');
    }
  }
}
```

### Domain Services

```typescript
export class AppOrchestrationService {
  validateAppDefinition(app: FriggApp): ValidationResult {
    const errors: string[] = [];
    
    // Business rule: App must have at least one integration
    if (app.getIntegrations().isEmpty()) {
      errors.push('App must have at least one integration');
    }
    
    // Business rule: Core modules must be compatible
    const incompatibleModules = this.findIncompatibleModules(app);
    if (incompatibleModules.length > 0) {
      errors.push(`Incompatible core modules: ${incompatibleModules.join(', ')}`);
    }
    
    return ValidationResult.create(errors);
  }

  private findIncompatibleModules(app: FriggApp): string[] {
    // Domain logic for module compatibility
    return [];
  }
}

export class IntegrationValidationService {
  validateIntegrationConfig(
    integration: Integration,
    config: IntegrationConfig
  ): ValidationResult {
    const errors: string[] = [];
    
    // Business rule: API modules must support required operations
    const requiredOps = config.getRequiredOperations();
    const supportedOps = integration.getSupportedOperations();
    
    const missing = requiredOps.filter(op => !supportedOps.includes(op));
    if (missing.length > 0) {
      errors.push(`Missing required operations: ${missing.join(', ')}`);
    }
    
    return ValidationResult.create(errors);
  }
}
```

### Domain Events

```typescript
export abstract class DomainEvent {
  protected constructor(
    public readonly aggregateId: string,
    public readonly occurredOn: Date = new Date()
  ) {}

  abstract getEventName(): string;
}

export class AppCreated extends DomainEvent {
  constructor(
    public readonly appId: AppId,
    public readonly appName: AppName,
    occurredOn?: Date
  ) {
    super(appId.getValue(), occurredOn);
  }

  getEventName(): string {
    return 'app.created';
  }
}

export class IntegrationConfigured extends DomainEvent {
  constructor(
    public readonly integrationId: IntegrationId,
    public readonly config: IntegrationConfig,
    occurredOn?: Date
  ) {
    super(integrationId.getValue(), occurredOn);
  }

  getEventName(): string {
    return 'integration.configured';
  }
}
```

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
- [ ] Create domain package structure
- [ ] Implement base Entity and ValueObject classes
- [ ] Add domain event infrastructure
- [ ] Set up TypeScript configuration

### Phase 2: Primary Entities (Week 2)
- [ ] Implement FriggApp entity with tests
- [ ] Implement Integration entity with tests
- [ ] Implement ApiModule entity with tests
- [ ] Add domain event handling

### Phase 3: Value Objects (Week 3)
- [ ] Implement core value objects (AppId, IntegrationId, etc.)
- [ ] Implement configuration value objects
- [ ] Add validation logic and tests

### Phase 4: Domain Services (Week 4)
- [ ] Implement AppOrchestrationService
- [ ] Implement IntegrationValidationService
- [ ] Add comprehensive business rule tests

## Testing Strategy

### Unit Tests
```typescript
describe('FriggApp', () => {
  describe('create', () => {
    it('should create app with valid parameters', () => {
      const name = AppName.create('Test App');
      const version = Version.create('1.0.0');
      const coreModules = CoreModuleCollection.empty();
      
      const app = FriggApp.create(name, version, coreModules);
      
      expect(app.getName()).toEqual(name);
      expect(app.getVersion()).toEqual(version);
    });
  });

  describe('addIntegration', () => {
    it('should add compatible integration', () => {
      const app = createTestApp();
      const integration = createTestIntegration();
      
      app.addIntegration(integration);
      
      expect(app.getIntegrations().contains(integration)).toBe(true);
    });

    it('should reject incompatible integration', () => {
      const app = createTestApp();
      const incompatibleIntegration = createIncompatibleIntegration();
      
      expect(() => app.addIntegration(incompatibleIntegration))
        .toThrow('Integration type not supported');
    });
  });
});
```

## Migration Strategy

### Backward Compatibility
- Keep existing API intact during migration
- Create adapters to bridge old and new models
- Gradual migration of business logic to domain layer

### Coexistence Pattern
```typescript
// Existing code continues to work
class IntegrationBase {
  constructor(params) {
    // Wrap in domain entity
    this.domainEntity = Integration.fromLegacy(params);
  }
  
  // Delegate to domain entity
  configure(config) {
    return this.domainEntity.configure(IntegrationConfig.fromLegacy(config));
  }
}
```

## Success Metrics

- **Test Coverage**: 95% for domain layer
- **Business Logic Clarity**: All business rules documented and tested
- **Migration Readiness**: Zero breaking changes for existing integrations
- **Performance**: No degradation in integration creation/configuration times

## Security Considerations

- Domain validation prevents invalid states
- Business rules enforce security constraints
- Value objects ensure data integrity
- Events provide audit trail

## Alternatives Considered

1. **Keep current architecture** - Rejected due to maintainability issues
2. **Full rewrite** - Rejected due to risk and timeline
3. **Gradual refactoring without DDD** - Rejected as it doesn't address core issues

## Future Considerations

This RFC enables future enhancements:
- Event sourcing for complete audit trail
- CQRS for read/write optimization
- Domain-driven microservices decomposition
- Advanced business rule engines