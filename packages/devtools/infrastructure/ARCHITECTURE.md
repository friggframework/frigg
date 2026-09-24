# Frigg Infrastructure Architecture

This document describes the Domain-Driven Design (DDD) and Hexagonal Architecture patterns used in the Frigg infrastructure system.

## Architecture Overview

The infrastructure system follows **Hexagonal Architecture** (Ports & Adapters) with **Domain-Driven Design** principles to create a clean, testable, and extensible codebase.

### Core Principles

1. **Domain-Driven Design**: Infrastructure organized by business domains (database, networking, security, etc.)
2. **Hexagonal Architecture**: Clear separation between core logic and external dependencies
3. **Dependency Injection**: All external dependencies injected through interfaces
4. **Testability**: Easy to mock and test in isolation
5. **Multi-Cloud Ready**: Provider abstraction layer for AWS, GCP, Azure support

## Directory Structure

```
infrastructure/
├── infrastructure-composer.js (85 lines) - Main orchestrator
│
├── domains/
│   ├── database/
│   │   ├── aurora-builder.js          # Aurora RDS infrastructure
│   │   ├── aurora-resolver.js         # Ownership decisions
│   │   ├── migration-builder.js       # Database migrations
│   │   └── migration-resolver.js      # Migration ownership
│   │
│   ├── integration/
│   │   ├── integration-builder.js     # Integration queues & functions
│   │   ├── integration-resolver.js    # Queue ownership decisions
│   │   └── websocket-builder.js       # WebSocket API Gateway
│   │
│   ├── networking/
│   │   ├── vpc-builder.js             # VPC infrastructure
│   │   └── vpc-resolver.js            # VPC ownership decisions
│   │
│   ├── security/
│   │   ├── kms-builder.js             # KMS encryption keys
│   │   ├── kms-resolver.js            # KMS ownership decisions
│   │   └── iam-generator.js           # IAM policy generation
│   │
│   ├── parameters/
│   │   └── ssm-builder.js             # SSM Parameter Store
│   │
│   └── shared/
│       ├── base-builder.js            # Abstract builder base class
│       ├── base-resolver.js           # Abstract resolver base class
│       ├── builder-orchestrator.js    # Builder execution coordination
│       ├── resource-discovery.js      # AWS resource discovery
│       │
│       ├── providers/                  # Multi-cloud abstraction
│       │   ├── cloud-provider-adapter.js
│       │   ├── provider-factory.js
│       │   ├── aws-provider-adapter.js
│       │   ├── gcp-provider-adapter.stub.js
│       │   └── azure-provider-adapter.stub.js
│       │
│       ├── types/                      # Shared type definitions
│       │   ├── discovery-result.js
│       │   └── resource-ownership.js
│       │
│       └── utilities/
│           ├── handler-path-resolver.js
│           ├── base-definition-factory.js
│           └── prisma-layer-manager.js
```

## Ownership-Based Architecture

All infrastructure builders follow an **ownership-based pattern** that supports three modes:

### Resource Ownership Modes

1. **STACK** - Create resources in CloudFormation stack (default for new deployments)
2. **EXTERNAL** - Use existing resources outside the stack (user-provided IDs)
3. **AUTO** - Intelligent decision based on resource discovery

### Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│ Builder (Orchestration)                                 │
│  - Calls resolver for ownership decisions               │
│  - Creates CloudFormation resources based on decisions  │
│  - Generates serverless template configuration          │
└────────────────┬────────────────────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────────────────────┐
│ Resolver (Decision Making)                             │
│  - Analyzes discovery results                           │
│  - Applies user intent (ownership configuration)        │
│  - Returns ownership decisions for each resource        │
└────────────────┬────────────────────────────────────────┘
                 │ uses
┌────────────────▼────────────────────────────────────────┐
│ Discovery (Facts)                                       │
│  - Reports what exists in CloudFormation stack          │
│  - Reports what exists via AWS API                      │
│  - No decisions, just facts                             │
└─────────────────────────────────────────────────────────┘
```

### Example: Aurora Builder Flow

```javascript
// 1. Builder calls resolver
const resolver = new AuroraResourceResolver();
const decisions = resolver.resolveAll(appDefinition, discovery);

// 2. Resolver returns ownership decisions
{
  cluster: {
    ownership: 'STACK',
    physicalId: null,
    reason: 'No existing cluster found - will create in stack'
  },
  securityGroup: {
    ownership: 'EXTERNAL',
    physicalId: 'sg-12345',
    reason: 'Using existing VPC security group'
  }
}

// 3. Builder creates resources based on decisions
if (decisions.cluster.ownership === 'STACK') {
  createAuroraCluster(result);
} else {
  useExternalCluster(decisions.cluster.physicalId, result);
}
```

### CloudFormation Idempotency

When resources exist in the stack, builders include them in the template for **idempotent deployments**:

```javascript
// Resource exists in stack with ID: cluster-abc123
decisions.cluster = {
  ownership: 'STACK',
  physicalId: 'cluster-abc123',
  reason: 'Found in stack - will include definition (idempotent)'
};

// Builder includes definition - CloudFormation won't recreate
result.resources.AuroraCluster = {
  Type: 'AWS::RDS::DBCluster',
  Properties: { ... }
};
```

This ensures resources aren't deleted when removed from template.

## Completed Builders (Ownership-Based)

| Builder | Resolver | CloudFormation Resources | Status |
|---------|----------|--------------------------|--------|
| **Aurora Builder** | AuroraResourceResolver | RDS Cluster, Security Groups | ✅ Complete |
| **KMS Builder** | KmsResourceResolver | KMS Keys | ✅ Complete |
| **Migration Builder** | MigrationResourceResolver | S3 Bucket, SQS Queue | ✅ Complete |
| **Integration Builder** | IntegrationResourceResolver | SQS Queues (per-integration), InternalErrorQueue | ✅ Complete |
| **VPC Builder** | VpcResourceResolver | VPC, Subnets, Security Groups | ✅ Complete |

## Builder Patterns

### Builder Responsibilities

```javascript
class InfrastructureBuilder {
  // Determine if builder should execute
  shouldExecute(appDefinition): boolean

  // Validate app definition
  validate(appDefinition): ValidationResult

  // Build infrastructure
  async build(appDefinition, discovery): BuildResult

  // Declare dependencies on other builders
  getDependencies(): string[]
}
```

### BuildResult Structure

```javascript
{
  functions: {
    // Lambda function definitions (serverless template)
    myFunction: {
      handler: 'path/to/handler',
      events: [...]
    }
  },
  resources: {
    // CloudFormation resources
    MyResource: {
      Type: 'AWS::Service::Resource',
      Properties: { ... }
    }
  },
  environment: {
    // Environment variables for Lambda
    MY_VAR: { Ref: 'MyResource' }
  },
  iamStatements: [
    // IAM permissions
    { Effect: 'Allow', Action: [...], Resource: [...] }
  ],
  custom: {
    // Custom serverless.yml properties
  }
}
```

## Resolver Patterns

### Resolver Responsibilities

```javascript
class BaseResourceResolver {
  // Make ownership decisions for all resources
  resolveAll(appDefinition, discovery): Decisions

  // Helper: Find resource in CloudFormation stack
  findInStack(logicalId, discovery): Resource

  // Helper: Find external resource
  findExternal(resourceType, discovery): Resource

  // Helper: Check if resource is in stack
  isInStack(logicalId, discovery): boolean

  // Create decision objects
  createStackDecision(physicalId, reason): Decision
  createExternalDecision(physicalId, reason): Decision
}
```

### Decision Structure

```javascript
{
  ownership: 'STACK' | 'EXTERNAL',
  physicalId: 'resource-id' | null,
  reason: 'Human-readable explanation',
  metadata: {
    logicalId: 'CloudFormationLogicalId',
    resourceType: 'AWS::Service::Resource',
    userIntent: 'stack' | 'external' | 'auto',
    source: 'discovered' | 'new' | 'user-provided'
  }
}
```

## Discovery System

### Discovery Result Structure

```javascript
{
  // Resources in OUR CloudFormation stack
  stackManaged: [
    {
      logicalId: 'AuroraCluster',
      physicalId: 'cluster-abc123',
      resourceType: 'AWS::RDS::DBCluster'
    }
  ],

  // Resources outside our stack
  external: [
    {
      physicalId: 'vpc-xyz789',
      resourceType: 'AWS::EC2::VPC',
      source: 'aws-api'
    }
  ],

  // Stack metadata
  fromCloudFormation: true,
  stackName: 'my-app-prod',
  region: 'us-east-1'
}
```

### Discovery Sources

1. **CloudFormation Stack** - Primary source for stack-managed resources
2. **AWS API Discovery** - Fallback for resources outside stack
3. **User Configuration** - Explicit resource IDs in app definition

## Multi-Cloud Provider Abstraction

### Provider Interface

```javascript
class CloudProviderAdapter {
  async discoverVpc(config)
  async discoverKmsKeys(tags)
  async discoverRdsInstances(tags)
  async discoverSecurityGroups(vpcId)
  async describeStack(stackName)
}
```

### Implemented Providers

- **AWS** (✅ Complete) - Full implementation with lazy-loaded SDK
- **GCP** (🔜 Stub) - Interface documented for future implementation
- **Azure** (🔜 Stub) - Interface documented for future implementation

## Testing Strategy

### Builder Testing

```javascript
describe('AuroraBuilder', () => {
  it('creates cluster when ownership=STACK', async () => {
    const builder = new AuroraBuilder();
    const result = await builder.build(appDef, discovery);

    expect(result.resources.AuroraCluster).toBeDefined();
    expect(result.resources.AuroraCluster.Type).toBe('AWS::RDS::DBCluster');
  });
});
```

### Resolver Testing

```javascript
describe('AuroraResourceResolver', () => {
  it('decides STACK when no cluster exists', () => {
    const resolver = new AuroraResourceResolver();
    const decisions = resolver.resolveAll(appDef, emptyDiscovery);

    expect(decisions.cluster.ownership).toBe('STACK');
    expect(decisions.cluster.physicalId).toBeNull();
  });

  it('decides EXTERNAL when user provides cluster ID', () => {
    const appDef = {
      database: {
        aurora: {
          ownership: { cluster: 'external' },
          external: { clusterId: 'cluster-123' }
        }
      }
    };

    const decisions = resolver.resolveAll(appDef, discovery);

    expect(decisions.cluster.ownership).toBe('EXTERNAL');
    expect(decisions.cluster.physicalId).toBe('cluster-123');
  });
});
```

## Benefits of This Architecture

### 1. Separation of Concerns
- **Discovery** reports facts (what exists)
- **Resolvers** make decisions (ownership)
- **Builders** create infrastructure (CloudFormation)

### 2. Testability
- Mock resolvers for builder tests
- Mock discovery for resolver tests
- No need to mock AWS SDK directly

### 3. Flexibility
- Support both stack-managed and external resources
- Easy to add new ownership modes
- User can override automatic decisions

### 4. Idempotency
- Safe to deploy multiple times
- Resources in stack aren't deleted
- Changes only when definitions change

### 5. Multi-Cloud Ready
- Provider abstraction layer
- Same patterns across clouds
- Easy to add new providers

## Usage Examples

### Example 1: New Deployment (AUTO mode)

```javascript
const appDefinition = {
  name: 'my-app',
  database: { aurora: { enable: true } },
  encryption: { useDefaultKMSForFieldLevelEncryption: true }
};

// Discovery finds nothing
const discovery = { stackManaged: [], external: [] };

// Resolvers decide to create everything in stack
// Builders create CloudFormation resources
// Result: Complete new infrastructure
```

### Example 2: Use Existing VPC (EXTERNAL mode)

```javascript
const appDefinition = {
  name: 'my-app',
  vpc: {
    enable: true,
    ownership: { vpc: 'external' },
    external: {
      vpcId: 'vpc-12345',
      securityGroupIds: ['sg-67890']
    }
  }
};

// Resolver uses external VPC
// Builder references external VPC (no creation)
// Result: Lambda functions in existing VPC
```

### Example 3: Update Existing Stack (AUTO mode)

```javascript
// Discovery finds existing stack resources
const discovery = {
  stackManaged: [
    { logicalId: 'AuroraCluster', physicalId: 'cluster-abc' },
    { logicalId: 'KmsKey', physicalId: 'key-xyz' }
  ]
};

// Resolvers decide to keep in stack
// Builders include definitions (idempotent)
// Result: Safe deployment, no resource deletion
```

## Architecture Metrics

| Metric | Before Refactor | After Refactor | Improvement |
|--------|-----------------|----------------|-------------|
| **Main File Size** | 506 lines | 85 lines | 83% reduction |
| **Largest File** | 1,700 lines | <200 lines | 88% reduction |
| **Test Coverage** | Partial | Comprehensive | +350 tests |
| **Domains** | None | 5 clear domains | Better organization |
| **Testability** | Difficult | Easy | DI + mocks |
| **Cloud Support** | AWS only | Multi-cloud ready | Future-proof |

## Key Design Decisions

### Why Ownership-Based?

1. **Flexibility** - Support both greenfield and brownfield deployments
2. **Safety** - Prevent accidental resource deletion
3. **User Control** - Let users choose stack vs. external
4. **Idempotency** - Safe repeated deployments

### Why Separate Resolvers?

1. **Single Responsibility** - Builders orchestrate, resolvers decide
2. **Testability** - Test decisions independently from creation
3. **Reusability** - Same resolver logic across builders
4. **Clarity** - Clear separation of concerns

### Why Hexagonal Architecture?

1. **Testability** - Easy to mock external dependencies
2. **Flexibility** - Swap implementations without changing core
3. **Multi-Cloud** - Provider abstraction natural fit
4. **Maintainability** - Clear boundaries and responsibilities

## Future Enhancements

- [ ] GCP provider implementation
- [ ] Azure provider implementation
- [ ] Enhanced resource discovery (tags, filters)
- [ ] Cost estimation before deployment
- [ ] Dependency graph visualization
- [ ] Automated rollback on failure

---

**This architecture transformation took monolithic infrastructure code and created a clean, testable, extensible system following industry best practices for Domain-Driven Design and Hexagonal Architecture.**
