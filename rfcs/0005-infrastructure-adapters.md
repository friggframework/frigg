# RFC: Infrastructure Adapters - Hexagonal Architecture Implementation

**RFC Number**: 0005  
**Title**: Implement Infrastructure Adapters for External System Integration  
**Status**: Draft  
**Created**: 2025-07-01  
**Author**: Claude Code with SAFLA  
**Dependencies**: RFC 0002 (Domain Layer), RFC 0003 (Repository Pattern), RFC 0004 (Application Services)  
**Related**: RFC 0006 (Multi-Language Code Generation)

## Summary

This RFC proposes implementing Infrastructure Adapters that complete the hexagonal architecture by providing concrete implementations for external system integration. This enables the swappable core modules vision and provides true technology independence.

## Motivation

The current Frigg Framework directly integrates with specific technologies, preventing the vision of swappable core modules:

1. **Technology lock-in** - Hardcoded MongoDB, AWS dependencies
2. **Testing complexity** - Integration tests require external services
3. **Limited flexibility** - Cannot easily switch providers
4. **Deployment constraints** - Tied to specific cloud platforms
5. **Extension limitations** - Hard to add new provider support

## Detailed Design

### Adapter Architecture

```
packages/core/src/infrastructure/
├── adapters/
│   ├── database/
│   │   ├── mongodb/
│   │   │   ├── MongoFriggAppRepository.ts
│   │   │   ├── MongoIntegrationRepository.ts
│   │   │   └── MongoUnitOfWork.ts
│   │   ├── postgresql/
│   │   │   ├── PostgresFriggAppRepository.ts
│   │   │   └── PostgresUnitOfWork.ts
│   │   └── in-memory/
│   │       ├── InMemoryFriggAppRepository.ts
│   │       └── InMemoryUnitOfWork.ts
│   ├── cloud/
│   │   ├── aws/
│   │   │   ├── AwsDeploymentService.ts
│   │   │   ├── AwsSecretsManager.ts
│   │   │   └── AwsQueueService.ts
│   │   ├── azure/
│   │   │   ├── AzureDeploymentService.ts
│   │   │   └── AzureKeyVault.ts
│   │   └── gcp/
│   │       ├── GcpDeploymentService.ts
│   │       └── GcpSecretManager.ts
│   ├── messaging/
│   │   ├── rabbitmq/
│   │   ├── kafka/
│   │   └── aws-sqs/
│   ├── storage/
│   │   ├── s3/
│   │   ├── azure-blob/
│   │   └── gcp-storage/
│   └── monitoring/
│       ├── datadog/
│       ├── new-relic/
│       └── prometheus/
├── ports/
│   ├── DeploymentService.ts        # Port interfaces
│   ├── SecretsManager.ts
│   ├── QueueService.ts
│   ├── StorageService.ts
│   └── MonitoringService.ts
├── config/
│   ├── AdapterConfiguration.ts     # Adapter selection
│   ├── DatabaseConfig.ts
│   └── CloudConfig.ts
└── shared/
    ├── AdapterFactory.ts           # Adapter instantiation
    └── HealthCheck.ts              # Adapter health monitoring
```

### Port Definitions (Interfaces)

#### Deployment Service Port
```typescript
export interface DeploymentService {
  deploy(app: FriggApp, config: DeploymentConfig): Promise<DeploymentResult>;
  undeploy(deploymentId: DeploymentId): Promise<void>;
  scale(deploymentId: DeploymentId, scaling: ScalingConfig): Promise<void>;
  getStatus(deploymentId: DeploymentId): Promise<DeploymentStatus>;
  getLogs(deploymentId: DeploymentId, options: LogOptions): Promise<LogEntry[]>;
}

export interface DeploymentConfig {
  environment: Environment;
  resources: ResourceRequirements;
  networking: NetworkingConfig;
  secrets: SecretConfiguration[];
  environmentVariables: Record<string, string>;
}

export interface DeploymentResult {
  deploymentId: DeploymentId;
  endpoint: string;
  status: DeploymentStatus;
  metadata: Record<string, any>;
}
```

#### Secrets Management Port
```typescript
export interface SecretsManager {
  store(key: SecretKey, value: SecretValue, options?: SecretOptions): Promise<void>;
  retrieve(key: SecretKey): Promise<SecretValue | null>;
  update(key: SecretKey, value: SecretValue): Promise<void>;
  delete(key: SecretKey): Promise<void>;
  list(prefix?: string): Promise<SecretKey[]>;
  rotate(key: SecretKey): Promise<SecretValue>;
}

export interface SecretOptions {
  ttl?: number;
  encryption?: EncryptionConfig;
  accessPolicy?: AccessPolicy;
  tags?: Record<string, string>;
}
```

#### Queue Service Port
```typescript
export interface QueueService {
  createQueue(config: QueueConfig): Promise<Queue>;
  deleteQueue(queueName: QueueName): Promise<void>;
  sendMessage(queue: Queue, message: Message): Promise<MessageId>;
  receiveMessages(queue: Queue, options: ReceiveOptions): Promise<Message[]>;
  acknowledgeMessage(queue: Queue, messageId: MessageId): Promise<void>;
  deadLetterMessage(queue: Queue, messageId: MessageId, reason: string): Promise<void>;
}

export interface QueueConfig {
  name: QueueName;
  maxRetries: number;
  visibilityTimeout: number;
  deadLetterQueue?: QueueName;
  fifo?: boolean;
}
```

#### Storage Service Port
```typescript
export interface StorageService {
  store(key: StorageKey, data: Buffer, options?: StorageOptions): Promise<void>;
  retrieve(key: StorageKey): Promise<Buffer | null>;
  delete(key: StorageKey): Promise<void>;
  exists(key: StorageKey): Promise<boolean>;
  list(prefix?: string): Promise<StorageKey[]>;
  generateSignedUrl(key: StorageKey, operation: 'read' | 'write', ttl: number): Promise<string>;
}

export interface StorageOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  encryption?: boolean;
  publicAccess?: boolean;
}
```

### Adapter Implementations

#### AWS Cloud Adapter
```typescript
export class AwsDeploymentService implements DeploymentService {
  constructor(
    private ecsClient: ECSClient,
    private ec2Client: EC2Client,
    private elbClient: ELBv2Client,
    private config: AwsDeploymentConfig
  ) {}

  async deploy(app: FriggApp, config: DeploymentConfig): Promise<DeploymentResult> {
    try {
      // 1. Create ECS cluster if needed
      const cluster = await this.ensureClusterExists(config.environment);
      
      // 2. Create task definition
      const taskDefinition = await this.createTaskDefinition(app, config);
      
      // 3. Create service
      const service = await this.createService(cluster, taskDefinition, config);
      
      // 4. Create load balancer
      const loadBalancer = await this.createLoadBalancer(service, config);
      
      // 5. Wait for deployment to be ready
      await this.waitForDeployment(service);
      
      return DeploymentResult.create(
        DeploymentId.create(service.serviceArn),
        loadBalancer.dnsName,
        DeploymentStatus.RUNNING,
        {
          clusterArn: cluster.clusterArn,
          serviceArn: service.serviceArn,
          taskDefinitionArn: taskDefinition.taskDefinitionArn
        }
      );
    } catch (error) {
      throw new DeploymentError(`AWS deployment failed: ${error.message}`, error);
    }
  }

  private async createTaskDefinition(app: FriggApp, config: DeploymentConfig): Promise<TaskDefinition> {
    const containerDefinitions = this.buildContainerDefinitions(app, config);
    
    const taskDefInput = {
      family: `frigg-${app.getName().getValue()}`,
      networkMode: 'awsvpc',
      requiresCompatibilities: ['FARGATE'],
      cpu: config.resources.cpu.toString(),
      memory: config.resources.memory.toString(),
      containerDefinitions,
      executionRoleArn: config.executionRoleArn,
      taskRoleArn: config.taskRoleArn
    };
    
    const response = await this.ecsClient.registerTaskDefinition(taskDefInput);
    return response.taskDefinition;
  }
}
```

#### Azure Cloud Adapter
```typescript
export class AzureDeploymentService implements DeploymentService {
  constructor(
    private containerClient: ContainerInstanceManagementClient,
    private resourceClient: ResourceManagementClient,
    private config: AzureDeploymentConfig
  ) {}

  async deploy(app: FriggApp, config: DeploymentConfig): Promise<DeploymentResult> {
    try {
      // 1. Create resource group
      const resourceGroup = await this.ensureResourceGroup(config.environment);
      
      // 2. Create container instance
      const containerInstance = await this.createContainerInstance(app, config, resourceGroup);
      
      // 3. Configure networking
      const publicIp = await this.configureNetworking(containerInstance, config);
      
      return DeploymentResult.create(
        DeploymentId.create(containerInstance.id),
        publicIp.dnsSettings.fqdn,
        DeploymentStatus.RUNNING,
        {
          resourceGroupName: resourceGroup.name,
          containerInstanceName: containerInstance.name
        }
      );
    } catch (error) {
      throw new DeploymentError(`Azure deployment failed: ${error.message}`, error);
    }
  }
}
```

#### Database Adapters

##### MongoDB Adapter
```typescript
export class MongoFriggAppRepository implements FriggAppRepository {
  constructor(
    private collection: Collection<FriggAppDocument>,
    private mapper: FriggAppMapper
  ) {}

  async save(app: FriggApp): Promise<void> {
    const document = this.mapper.toPersistence(app);
    
    await this.collection.replaceOne(
      { _id: document._id },
      document,
      { upsert: true }
    );
  }

  async findById(id: AppId): Promise<FriggApp | null> {
    const document = await this.collection.findOne({ _id: new ObjectId(id.getValue()) });
    return document ? this.mapper.toDomain(document) : null;
  }

  async findByUserId(userId: UserId): Promise<FriggApp[]> {
    const documents = await this.collection
      .find({ userId: userId.getValue() })
      .toArray();
    
    return documents.map(doc => this.mapper.toDomain(doc));
  }

  async findMany(specification: Specification<FriggApp>): Promise<FriggApp[]> {
    // Convert specification to MongoDB query
    const query = this.specificationToQuery(specification);
    const documents = await this.collection.find(query).toArray();
    
    return documents
      .map(doc => this.mapper.toDomain(doc))
      .filter(app => specification.isSatisfiedBy(app));
  }

  private specificationToQuery(spec: Specification<FriggApp>): FilterQuery<FriggAppDocument> {
    // Implementation depends on specific specification types
    // Could use visitor pattern for complex specifications
    return {};
  }
}
```

##### PostgreSQL Adapter
```typescript
export class PostgresFriggAppRepository implements FriggAppRepository {
  constructor(
    private pool: Pool,
    private mapper: FriggAppMapper
  ) {}

  async save(app: FriggApp): Promise<void> {
    const data = this.mapper.toPersistence(app);
    
    const query = `
      INSERT INTO frigg_apps (id, name, version, user_id, data, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        version = EXCLUDED.version,
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at
    `;
    
    await this.pool.query(query, [
      data.id,
      data.name,
      data.version,
      data.userId,
      JSON.stringify(data),
      data.createdAt,
      data.updatedAt
    ]);
  }

  async findById(id: AppId): Promise<FriggApp | null> {
    const query = 'SELECT * FROM frigg_apps WHERE id = $1';
    const result = await this.pool.query(query, [id.getValue()]);
    
    if (result.rows.length === 0) return null;
    
    return this.mapper.toDomain(result.rows[0]);
  }
}
```

### Adapter Configuration and Selection

#### Configuration System
```typescript
export interface AdapterConfiguration {
  database: DatabaseAdapterConfig;
  cloud: CloudAdapterConfig;
  messaging: MessagingAdapterConfig;
  storage: StorageAdapterConfig;
  monitoring: MonitoringAdapterConfig;
}

export interface DatabaseAdapterConfig {
  type: 'mongodb' | 'postgresql' | 'mysql' | 'in-memory';
  connectionString?: string;
  options?: Record<string, any>;
}

export interface CloudAdapterConfig {
  type: 'aws' | 'azure' | 'gcp' | 'local';
  region?: string;
  credentials?: CloudCredentials;
  options?: Record<string, any>;
}

export class AdapterConfigurationLoader {
  static load(environment: Environment): AdapterConfiguration {
    const config = {
      database: {
        type: process.env.FRIGG_DATABASE_TYPE || 'mongodb',
        connectionString: process.env.FRIGG_DATABASE_URL,
        options: this.parseDatabaseOptions(process.env.FRIGG_DATABASE_OPTIONS)
      },
      cloud: {
        type: process.env.FRIGG_CLOUD_PROVIDER || 'aws',
        region: process.env.FRIGG_CLOUD_REGION,
        credentials: this.loadCloudCredentials()
      },
      // ... other configurations
    };
    
    return this.validateConfiguration(config);
  }
}
```

#### Adapter Factory
```typescript
export class AdapterFactory {
  constructor(private config: AdapterConfiguration) {}

  createDatabaseAdapters(): DatabaseAdapters {
    switch (this.config.database.type) {
      case 'mongodb':
        return this.createMongoAdapters();
      case 'postgresql':
        return this.createPostgresAdapters();
      case 'in-memory':
        return this.createInMemoryAdapters();
      default:
        throw new AdapterConfigurationError(`Unsupported database type: ${this.config.database.type}`);
    }
  }

  createCloudAdapters(): CloudAdapters {
    switch (this.config.cloud.type) {
      case 'aws':
        return this.createAwsAdapters();
      case 'azure':
        return this.createAzureAdapters();
      case 'gcp':
        return this.createGcpAdapters();
      case 'local':
        return this.createLocalAdapters();
      default:
        throw new AdapterConfigurationError(`Unsupported cloud provider: ${this.config.cloud.type}`);
    }
  }

  private createMongoAdapters(): DatabaseAdapters {
    const client = new MongoClient(this.config.database.connectionString);
    const db = client.db();
    
    return {
      friggAppRepository: new MongoFriggAppRepository(
        db.collection('frigg_apps'),
        new FriggAppMapper()
      ),
      integrationRepository: new MongoIntegrationRepository(
        db.collection('integrations'),
        new IntegrationMapper()
      ),
      unitOfWork: new MongoUnitOfWork(client)
    };
  }
}
```

### Health Monitoring and Circuit Breaker

```typescript
export class AdapterHealthCheck {
  constructor(
    private adapters: Record<string, any>,
    private circuitBreaker: CircuitBreaker
  ) {}

  async checkHealth(): Promise<HealthStatus> {
    const results = await Promise.allSettled([
      this.checkDatabaseHealth(),
      this.checkCloudHealth(),
      this.checkMessagingHealth(),
      this.checkStorageHealth()
    ]);

    return HealthStatus.fromResults(results);
  }

  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    try {
      await this.adapters.database.healthCheck();
      return ComponentHealth.healthy('database');
    } catch (error) {
      return ComponentHealth.unhealthy('database', error.message);
    }
  }
}

export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.config.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new CircuitBreakerOpenError('Circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
}
```

## Implementation Plan

### Phase 1: Port Definitions (Week 1)
- [ ] Define all infrastructure port interfaces
- [ ] Create adapter configuration system
- [ ] Implement adapter factory pattern
- [ ] Add health check infrastructure

### Phase 2: Database Adapters (Week 2)
- [ ] Implement MongoDB adapters (current technology)
- [ ] Implement PostgreSQL adapters
- [ ] Create in-memory adapters for testing
- [ ] Add comprehensive adapter tests

### Phase 3: Cloud Provider Adapters (Week 3)
- [ ] Implement AWS adapters (current platform)
- [ ] Implement Azure adapters
- [ ] Create local development adapters
- [ ] Add deployment integration tests

### Phase 4: Additional Services (Week 4)
- [ ] Implement messaging service adapters
- [ ] Implement storage service adapters
- [ ] Add monitoring service adapters
- [ ] Complete integration and performance testing

## Testing Strategy

### Adapter Testing Pattern
```typescript
// Abstract test suite for adapter implementations
export abstract class AdapterTestSuite<TAdapter extends DeploymentService> {
  protected abstract createAdapter(): TAdapter;
  protected abstract createTestApp(): FriggApp;
  protected abstract createTestConfig(): DeploymentConfig;

  describe('DeploymentService', () => {
    let adapter: TAdapter;

    beforeEach(() => {
      adapter = this.createAdapter();
    });

    it('should deploy app successfully', async () => {
      const app = this.createTestApp();
      const config = this.createTestConfig();

      const result = await adapter.deploy(app, config);

      expect(result.status).toBe(DeploymentStatus.RUNNING);
      expect(result.endpoint).toBeDefined();
    });

    it('should handle deployment failures gracefully', async () => {
      const app = this.createTestApp();
      const invalidConfig = this.createInvalidConfig();

      await expect(adapter.deploy(app, invalidConfig))
        .rejects.toThrow(DeploymentError);
    });
  });
}

// Concrete implementations
class AwsAdapterTests extends AdapterTestSuite<AwsDeploymentService> {
  protected createAdapter(): AwsDeploymentService {
    return new AwsDeploymentService(/* mock AWS clients */);
  }
}

class LocalAdapterTests extends AdapterTestSuite<LocalDeploymentService> {
  protected createAdapter(): LocalDeploymentService {
    return new LocalDeploymentService(/* local config */);
  }
}
```

### Contract Testing
```typescript
// Ensure all adapters follow the same contracts
describe('Adapter Contracts', () => {
  const adapterTypes = ['aws', 'azure', 'local'];

  adapterTypes.forEach(type => {
    describe(`${type} adapters`, () => {
      it('should implement DeploymentService contract', () => {
        const factory = new AdapterFactory(createConfigForType(type));
        const adapter = factory.createDeploymentService();
        
        expect(adapter).toHaveProperty('deploy');
        expect(adapter).toHaveProperty('undeploy');
        expect(adapter).toHaveProperty('scale');
        expect(adapter).toHaveProperty('getStatus');
      });
    });
  });
});
```

## Migration Strategy

### Gradual Adapter Introduction
1. **Create adapters alongside existing implementations**
2. **Add configuration switching mechanism**
3. **Migrate development environments first**
4. **Migrate production environments with rollback capability**

### Compatibility Layer
```typescript
// Adapter wrapper for existing implementations
export class LegacyAdapterWrapper implements DeploymentService {
  constructor(private legacyService: any) {}

  async deploy(app: FriggApp, config: DeploymentConfig): Promise<DeploymentResult> {
    // Convert new domain objects to legacy format
    const legacyApp = this.convertToLegacyApp(app);
    const legacyConfig = this.convertToLegacyConfig(config);
    
    // Call legacy service
    const legacyResult = await this.legacyService.deploy(legacyApp, legacyConfig);
    
    // Convert result back to new format
    return this.convertToNewResult(legacyResult);
  }
}
```

## Success Metrics

- **Adapter Coverage**: 100% of infrastructure ports have at least 2 implementations
- **Test Coverage**: 95% for all adapter implementations
- **Performance**: No degradation when switching between adapters
- **Reliability**: 99.9% uptime with circuit breaker protection

## Security Considerations

- Credential management through secure secret storage
- Network isolation between adapters and external services
- Audit logging for all infrastructure operations
- Encryption in transit and at rest for all data

## Future Considerations

This RFC enables:
- Multi-cloud deployment strategies
- Vendor-neutral infrastructure
- Simplified testing and development
- Plugin-based adapter marketplace
- Cost optimization through provider switching