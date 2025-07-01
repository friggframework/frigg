# RFC: Repository Pattern Implementation

**RFC Number**: 0003  
**Title**: Implement Repository Pattern for Data Access Abstraction  
**Status**: Draft  
**Created**: 2025-07-01  
**Author**: Claude Code with SAFLA  
**Dependencies**: RFC 0002 (Domain Layer Foundation)  
**Related**: RFC 0004 (Application Services), RFC 0005 (Infrastructure Adapters)

## Summary

This RFC proposes implementing the Repository Pattern to abstract data access concerns from the domain layer. This will decouple business logic from specific database implementations and enable flexible data storage strategies.

## Motivation

The current Frigg Framework directly couples domain entities to MongoDB through Mongoose models, creating several issues:

1. **Infrastructure coupling** - Business logic depends on specific database technology
2. **Testing difficulty** - Hard to unit test without database setup
3. **Limited flexibility** - Cannot easily switch between storage mechanisms
4. **Violation of DDD principles** - Domain entities contain persistence concerns

## Detailed Design

### Repository Interface Structure

```
packages/core/src/domain/repositories/
├── FriggAppRepository.ts        # Core app persistence
├── IntegrationRepository.ts     # Integration management
├── ApiModuleRepository.ts       # Module registry
├── UserRepository.ts            # User management
└── shared/
    ├── Repository.ts            # Base repository interface
    └── Specification.ts         # Query specification pattern
```

### Base Repository Interface

```typescript
export interface Repository<TEntity extends Entity<TId>, TId extends ValueObject<any>> {
  findById(id: TId): Promise<TEntity | null>;
  save(entity: TEntity): Promise<void>;
  delete(id: TId): Promise<void>;
  exists(id: TId): Promise<boolean>;
}

export interface ReadOnlyRepository<TEntity extends Entity<TId>, TId extends ValueObject<any>> {
  findById(id: TId): Promise<TEntity | null>;
  exists(id: TId): Promise<boolean>;
}

export interface SearchableRepository<TEntity extends Entity<TId>, TId extends ValueObject<any>> 
  extends Repository<TEntity, TId> {
  findMany(specification: Specification<TEntity>): Promise<TEntity[]>;
  findFirst(specification: Specification<TEntity>): Promise<TEntity | null>;
  count(specification: Specification<TEntity>): Promise<number>;
}
```

### Domain Repository Interfaces

#### Frigg App Repository
```typescript
export interface FriggAppRepository extends SearchableRepository<FriggApp, AppId> {
  findByUserId(userId: UserId): Promise<FriggApp[]>;
  findByName(name: AppName): Promise<FriggApp | null>;
  findActiveApps(): Promise<FriggApp[]>;
  findAppsWithIntegrationType(type: IntegrationType): Promise<FriggApp[]>;
}

export interface FriggAppReadModel {
  id: string;
  name: string;
  version: string;
  userId: string;
  integrationCount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FriggAppQueryRepository extends ReadOnlyRepository<FriggAppReadModel, AppId> {
  findAppSummariesByUser(userId: UserId): Promise<FriggAppReadModel[]>;
  findAppMetrics(appId: AppId): Promise<AppMetrics>;
  searchApps(query: AppSearchQuery): Promise<SearchResult<FriggAppReadModel>>;
}
```

#### Integration Repository
```typescript
export interface IntegrationRepository extends SearchableRepository<Integration, IntegrationId> {
  findByAppId(appId: AppId): Promise<Integration[]>;
  findByType(type: IntegrationType): Promise<Integration[]>;
  findByStatus(status: IntegrationStatus): Promise<Integration[]>;
  findPendingActivation(): Promise<Integration[]>;
}

export interface IntegrationQueryRepository {
  findIntegrationHealth(integrationId: IntegrationId): Promise<IntegrationHealth>;
  findUsageMetrics(integrationId: IntegrationId, period: TimePeriod): Promise<UsageMetrics>;
  findErrorLogs(integrationId: IntegrationId, limit: number): Promise<ErrorLog[]>;
}
```

#### API Module Repository
```typescript
export interface ApiModuleRepository extends Repository<ApiModule, ModuleId> {
  findByPlatform(platform: Platform): Promise<ApiModule[]>;
  findByVersion(version: ModuleVersion): Promise<ApiModule[]>;
  findCompatibleModules(requirements: ModuleRequirements): Promise<ApiModule[]>;
  findLatestVersion(moduleId: ModuleId): Promise<ApiModule | null>;
}

export interface ModuleRegistryRepository extends ReadOnlyRepository<ModuleDefinition, ModuleId> {
  searchModules(query: ModuleSearchQuery): Promise<SearchResult<ModuleDefinition>>;
  findPopularModules(limit: number): Promise<ModuleDefinition[]>;
  findModulesByCategory(category: ModuleCategory): Promise<ModuleDefinition[]>;
}
```

### Specification Pattern for Queries

```typescript
export abstract class Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean;
  
  and(other: Specification<T>): Specification<T> {
    return new AndSpecification(this, other);
  }
  
  or(other: Specification<T>): Specification<T> {
    return new OrSpecification(this, other);
  }
  
  not(): Specification<T> {
    return new NotSpecification(this);
  }
}

// Domain-specific specifications
export class AppByUserSpecification extends Specification<FriggApp> {
  constructor(private userId: UserId) {
    super();
  }
  
  isSatisfiedBy(app: FriggApp): boolean {
    return app.getUserId().equals(this.userId);
  }
}

export class ActiveIntegrationSpecification extends Specification<Integration> {
  isSatisfiedBy(integration: Integration): boolean {
    return integration.getStatus() === IntegrationStatus.ACTIVE;
  }
}

// Usage example
const activeUserApps = new AppByUserSpecification(userId)
  .and(new ActiveAppSpecification());

const apps = await appRepository.findMany(activeUserApps);
```

### Repository Implementation Strategy

#### In-Memory Implementation (for testing)
```typescript
export class InMemoryFriggAppRepository implements FriggAppRepository {
  private apps = new Map<string, FriggApp>();
  
  async findById(id: AppId): Promise<FriggApp | null> {
    return this.apps.get(id.getValue()) || null;
  }
  
  async save(app: FriggApp): Promise<void> {
    this.apps.set(app.getId().getValue(), app);
  }
  
  async findByUserId(userId: UserId): Promise<FriggApp[]> {
    return Array.from(this.apps.values())
      .filter(app => app.getUserId().equals(userId));
  }
  
  async findMany(specification: Specification<FriggApp>): Promise<FriggApp[]> {
    return Array.from(this.apps.values())
      .filter(app => specification.isSatisfiedBy(app));
  }
}
```

#### Database Mapper Pattern
```typescript
export interface EntityMapper<TDomain, TPersistence> {
  toDomain(persistence: TPersistence): TDomain;
  toPersistence(domain: TDomain): TPersistence;
}

export class FriggAppMapper implements EntityMapper<FriggApp, FriggAppDocument> {
  toDomain(doc: FriggAppDocument): FriggApp {
    const id = AppId.create(doc._id.toString());
    const name = AppName.create(doc.name);
    const version = Version.create(doc.version);
    
    const integrations = doc.integrations.map(i => 
      this.integrationMapper.toDomain(i)
    );
    
    return FriggApp.reconstruct(id, name, version, 
      IntegrationCollection.from(integrations)
    );
  }
  
  toPersistence(app: FriggApp): FriggAppDocument {
    return {
      _id: new ObjectId(app.getId().getValue()),
      name: app.getName().getValue(),
      version: app.getVersion().getValue(),
      integrations: app.getIntegrations().getAll()
        .map(i => this.integrationMapper.toPersistence(i)),
      createdAt: app.getCreatedAt(),
      updatedAt: new Date()
    };
  }
}
```

### Transaction Support

```typescript
export interface UnitOfWork {
  registerNew<T extends Entity<any>>(entity: T, repository: Repository<T, any>): void;
  registerDirty<T extends Entity<any>>(entity: T, repository: Repository<T, any>): void;
  registerDeleted<T extends Entity<any>>(entity: T, repository: Repository<T, any>): void;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class DatabaseUnitOfWork implements UnitOfWork {
  private newEntities: Array<{entity: Entity<any>, repository: Repository<any, any>}> = [];
  private dirtyEntities: Array<{entity: Entity<any>, repository: Repository<any, any>}> = [];
  private deletedEntities: Array<{entity: Entity<any>, repository: Repository<any, any>}> = [];
  
  constructor(private session: ClientSession) {}
  
  async commit(): Promise<void> {
    await this.session.withTransaction(async () => {
      // Save new entities
      for (const {entity, repository} of this.newEntities) {
        await repository.save(entity);
      }
      
      // Update dirty entities
      for (const {entity, repository} of this.dirtyEntities) {
        await repository.save(entity);
      }
      
      // Delete entities
      for (const {entity, repository} of this.deletedEntities) {
        await repository.delete(entity.getId());
      }
    });
  }
}
```

## Implementation Plan

### Phase 1: Repository Interfaces (Week 1)
- [ ] Define base repository interfaces
- [ ] Create domain-specific repository interfaces
- [ ] Implement specification pattern
- [ ] Add comprehensive interface tests

### Phase 2: In-Memory Implementations (Week 2)
- [ ] Create in-memory repository implementations
- [ ] Implement entity mappers
- [ ] Add repository unit tests
- [ ] Integration with domain layer tests

### Phase 3: Database Implementations (Week 3)
- [ ] MongoDB repository implementations
- [ ] Entity mapping for existing schemas
- [ ] Migration strategy for existing data
- [ ] Performance optimization

### Phase 4: Advanced Features (Week 4)
- [ ] Unit of Work implementation
- [ ] Query optimization
- [ ] Caching strategies
- [ ] Read model repositories

## Testing Strategy

### Repository Testing Pattern
```typescript
// Abstract test suite for all repository implementations
export abstract class RepositoryTestSuite<TRepo extends FriggAppRepository> {
  protected abstract createRepository(): TRepo;
  protected abstract createTestApp(): FriggApp;
  
  describe('FriggAppRepository', () => {
    let repository: TRepo;
    
    beforeEach(() => {
      repository = this.createRepository();
    });
    
    it('should save and retrieve app', async () => {
      const app = this.createTestApp();
      
      await repository.save(app);
      const retrieved = await repository.findById(app.getId());
      
      expect(retrieved).toEqual(app);
    });
    
    it('should find apps by user', async () => {
      const userId = UserId.create('user-123');
      const app1 = this.createTestAppForUser(userId);
      const app2 = this.createTestAppForUser(userId);
      const otherApp = this.createTestAppForUser(UserId.create('user-456'));
      
      await repository.save(app1);
      await repository.save(app2);
      await repository.save(otherApp);
      
      const userApps = await repository.findByUserId(userId);
      
      expect(userApps).toHaveLength(2);
      expect(userApps).toContain(app1);
      expect(userApps).toContain(app2);
    });
  });
}

// Concrete test implementations
class InMemoryRepositoryTests extends RepositoryTestSuite<InMemoryFriggAppRepository> {
  protected createRepository(): InMemoryFriggAppRepository {
    return new InMemoryFriggAppRepository();
  }
}

class MongoRepositoryTests extends RepositoryTestSuite<MongoFriggAppRepository> {
  protected createRepository(): MongoFriggAppRepository {
    return new MongoFriggAppRepository(this.testConnection);
  }
}
```

## Migration Strategy

### Gradual Migration Approach
1. **Phase 1**: Create repository interfaces alongside existing code
2. **Phase 2**: Implement repositories wrapping existing database calls
3. **Phase 3**: Migrate application services to use repositories
4. **Phase 4**: Remove direct database access from domain layer

### Adapter Pattern for Existing Code
```typescript
// Wrap existing Mongoose models
export class MongooseAdapterRepository implements FriggAppRepository {
  constructor(private mongooseModel: Model<any>) {}
  
  async findById(id: AppId): Promise<FriggApp | null> {
    const doc = await this.mongooseModel.findById(id.getValue());
    return doc ? this.mapper.toDomain(doc) : null;
  }
  
  async save(app: FriggApp): Promise<void> {
    const doc = this.mapper.toPersistence(app);
    await this.mongooseModel.findByIdAndUpdate(doc._id, doc, { upsert: true });
  }
}
```

## Success Metrics

- **Decoupling**: Zero direct database imports in domain layer
- **Test Coverage**: 95% for repository implementations
- **Performance**: No degradation in query response times
- **Flexibility**: Ability to swap database implementations

## Security Considerations

- Repository interfaces enforce access control
- Specification pattern prevents SQL injection equivalents
- Unit of Work ensures transaction consistency
- Read models separate query concerns from command concerns

## Alternatives Considered

1. **Keep direct database access** - Rejected due to coupling issues
2. **Use existing ORM abstractions** - Rejected as insufficient for DDD
3. **Generic repository only** - Rejected as too abstract for domain needs
4. **Event sourcing** - Considered for future iteration

## Future Considerations

This RFC enables future enhancements:
- Event sourcing with event store repositories
- CQRS with separate read/write repositories
- Multi-tenant data partitioning
- Distributed transaction support