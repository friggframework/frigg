# Multi-Cloud Architecture - Discovery, Doctor & Repair

## Overview

This document describes the architecture for multi-cloud support in Frigg's infrastructure tooling, with a focus on the discovery, health checking (doctor), and repair capabilities.

**Key Principle**: Use Domain-Driven Design (DDD) and Hexagonal Architecture (Ports & Adapters) to support AWS today while making it obvious where to extend for GCP, Azure, Cloudflare, and non-serverless (Docker) deployments.

---

## Architecture Layers

```
┌──────────────────────────────────────────────────────────────┐
│                     CLI LAYER                                │
│   frigg doctor  |  frigg repair  |  frigg deploy            │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│              APPLICATION LAYER (Use Cases)                   │
│  Orchestrates business logic - provider agnostic             │
│                                                              │
│  • RunHealthCheckUseCase                                    │
│  • RepairStackViaImportUseCase                              │
│  • ReconcilePropertyMismatchesUseCase                       │
│  • DiscoverInfrastructureUseCase                            │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         │ Uses Ports (Interfaces)
                         │
┌────────────────────────▼─────────────────────────────────────┐
│                 PORT INTERFACES (Boundaries)                 │
│  Define contracts - implemented by adapters                  │
│                                                              │
│  • IStackRepository          - Stack CRUD operations        │
│  • IResourceDetector         - Cloud resource queries       │
│  • IDriftDetector            - Compare desired vs actual    │
│  • IResourceImporter         - Import existing resources    │
│  • IPropertyReconciler       - Fix property mismatches      │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         │ Implemented by
                         │
┌────────────────────────▼─────────────────────────────────────┐
│            ADAPTER LAYER (Provider-Specific)                 │
│                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐│
│  │  AWS Adapters   │  │  GCP Adapters   │  │ Azure        ││
│  │  (Today)        │  │  (Future)       │  │ Adapters     ││
│  │                 │  │                 │  │ (Future)     ││
│  │ • CloudFormation│  │ • Deployment    │  │ • ARM        ││
│  │ • AWS SDK APIs  │  │   Manager       │  │   Templates  ││
│  │ • Resource      │  │ • GCP APIs      │  │ • Azure      ││
│  │   Importers     │  │                 │  │   APIs       ││
│  └─────────────────┘  └─────────────────┘  └──────────────┘│
└──────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│                  CLOUD PROVIDERS                             │
│    AWS    |    GCP    |    Azure    |    Cloudflare         │
└──────────────────────────────────────────────────────────────┘
```

---

## Domain Structure

### Directory Organization

```
packages/devtools/infrastructure/
├── domains/
│   ├── health/                          # NEW - Health checking domain
│   │   ├── domain/                      # Domain layer (provider-agnostic)
│   │   │   ├── entities/
│   │   │   │   ├── Resource.js
│   │   │   │   ├── Issue.js
│   │   │   │   ├── PropertyMismatch.js
│   │   │   │   └── StackHealthReport.js
│   │   │   ├── value-objects/
│   │   │   │   ├── StackIdentifier.js
│   │   │   │   ├── HealthScore.js
│   │   │   │   ├── ResourceState.js    # IN_STACK, ORPHANED, MISSING, DRIFTED
│   │   │   │   └── PropertyMutability.js
│   │   │   ├── services/
│   │   │   │   ├── HealthScoreCalculator.js
│   │   │   │   └── MismatchAnalyzer.js
│   │   │   └── collections/
│   │   │       ├── ResourceCollection.js
│   │   │       └── IssueCollection.js
│   │   ├── application/                 # Application layer (use cases)
│   │   │   ├── use-cases/
│   │   │   │   ├── run-health-check-use-case.js
│   │   │   │   ├── repair-via-import-use-case.js
│   │   │   │   └── reconcile-properties-use-case.js
│   │   │   └── ports/                   # Port interfaces
│   │   │       ├── IStackRepository.js
│   │   │       ├── IResourceDetector.js
│   │   │       ├── IDriftDetector.js
│   │   │       ├── IResourceImporter.js
│   │   │       └── IPropertyReconciler.js
│   │   └── infrastructure/              # Infrastructure layer (adapters)
│   │       ├── adapters/
│   │       │   ├── aws/                 # AWS implementations (TODAY)
│   │       │   │   ├── AWSStackRepository.js
│   │       │   │   ├── AWSResourceDetector.js
│   │       │   │   ├── AWSDriftDetector.js
│   │       │   │   ├── AWSResourceImporter.js
│   │       │   │   └── AWSPropertyReconciler.js
│   │       │   ├── gcp/                 # GCP implementations (FUTURE)
│   │       │   │   ├── GCPStackRepository.js
│   │       │   │   └── ...
│   │       │   └── azure/               # Azure implementations (FUTURE)
│   │       │       ├── AzureStackRepository.js
│   │       │       └── ...
│   │       └── cli/
│   │           ├── doctor-command.js
│   │           ├── repair-command.js
│   │           └── presenters/
│   │               ├── health-report-presenter.js
│   │               └── repair-plan-presenter.js
│   │
│   ├── discovery/                       # REFACTORED - Cloud discovery domain
│   │   ├── domain/
│   │   │   ├── entities/
│   │   │   │   ├── DiscoveryResult.js
│   │   │   │   └── CloudResource.js
│   │   │   └── value-objects/
│   │   │       └── ResourceIdentifier.js
│   │   ├── application/
│   │   │   ├── use-cases/
│   │   │   │   └── discover-infrastructure-use-case.js
│   │   │   └── ports/
│   │   │       ├── ICloudProvider.js     # Port for cloud providers
│   │   │       └── IStackProvider.js     # Port for stack systems
│   │   └── infrastructure/
│   │       └── adapters/
│   │           ├── aws/
│   │           │   ├── AWSCloudProvider.js
│   │           │   ├── CloudFormationStackProvider.js
│   │           │   ├── EC2Discoverer.js
│   │           │   ├── RDSDiscoverer.js
│   │           │   └── KMSDiscoverer.js
│   │           ├── gcp/
│   │           │   ├── GCPCloudProvider.js
│   │           │   └── DeploymentManagerStackProvider.js
│   │           └── azure/
│   │               ├── AzureCloudProvider.js
│   │               └── ARMTemplateStackProvider.js
│   │
│   ├── networking/                      # PROVIDER-SPECIFIC builders
│   │   ├── aws/
│   │   │   ├── vpc-builder.js
│   │   │   └── vpc-resolver.js
│   │   ├── gcp/
│   │   │   ├── network-builder.js       # (FUTURE)
│   │   │   └── network-resolver.js
│   │   └── azure/
│   │       ├── vnet-builder.js          # (FUTURE)
│   │       └── vnet-resolver.js
│   │
│   ├── database/                        # PROVIDER-SPECIFIC builders
│   │   ├── aws/
│   │   │   ├── aurora-builder.js
│   │   │   ├── aurora-resolver.js
│   │   │   ├── migration-builder.js
│   │   │   └── migration-resolver.js
│   │   ├── gcp/
│   │   │   ├── cloud-sql-builder.js     # (FUTURE)
│   │   │   └── cloud-sql-resolver.js
│   │   └── azure/
│   │       ├── cosmos-db-builder.js     # (FUTURE)
│   │       └── cosmos-db-resolver.js
│   │
│   ├── security/                        # PROVIDER-SPECIFIC builders
│   │   ├── aws/
│   │   │   ├── kms-builder.js
│   │   │   └── kms-resolver.js
│   │   ├── gcp/
│   │   │   └── kms-builder.js           # (FUTURE)
│   │   └── azure/
│   │       └── key-vault-builder.js     # (FUTURE)
│   │
│   └── shared/                          # Shared utilities
│       ├── base-resource-resolver.js
│       ├── builder-orchestrator.js
│       └── resource-ownership.js
│
└── providers/                           # PROVIDER REGISTRY
    ├── registry.js                      # Maps provider name to implementations
    ├── aws-provider.js                  # AWS provider definition
    ├── gcp-provider.js                  # GCP provider definition (FUTURE)
    └── azure-provider.js                # Azure provider definition (FUTURE)
```

---

## Port Interfaces (Contracts)

### IStackRepository

```javascript
/**
 * Port: Stack Repository Interface
 *
 * Abstracts stack management operations (CloudFormation, Deployment Manager, ARM)
 */
class IStackRepository {
  /**
   * Get stack by identifier
   * @param {StackIdentifier} identifier
   * @returns {Promise<Stack|null>}
   */
  async getStack(identifier) {
    throw new Error('Not implemented');
  }

  /**
   * List resources in stack
   * @param {StackIdentifier} identifier
   * @returns {Promise<Resource[]>}
   */
  async listResources(identifier) {
    throw new Error('Not implemented');
  }

  /**
   * Get stack outputs
   * @param {StackIdentifier} identifier
   * @returns {Promise<Object>}
   */
  async getOutputs(identifier) {
    throw new Error('Not implemented');
  }

  /**
   * Get stack parameters
   * @param {StackIdentifier} identifier
   * @returns {Promise<Object>}
   */
  async getParameters(identifier) {
    throw new Error('Not implemented');
  }

  /**
   * Check if stack exists
   * @param {StackIdentifier} identifier
   * @returns {Promise<boolean>}
   */
  async exists(identifier) {
    throw new Error('Not implemented');
  }
}
```

### IResourceDetector

```javascript
/**
 * Port: Resource Detector Interface
 *
 * Abstracts cloud resource discovery (AWS APIs, GCP APIs, Azure APIs)
 */
class IResourceDetector {
  /**
   * Detect VPCs/Networks
   * @param {string} region
   * @returns {Promise<NetworkResource[]>}
   */
  async detectNetworks(region) {
    throw new Error('Not implemented');
  }

  /**
   * Detect database instances
   * @param {string} region
   * @returns {Promise<DatabaseResource[]>}
   */
  async detectDatabases(region) {
    throw new Error('Not implemented');
  }

  /**
   * Detect encryption keys
   * @param {string} region
   * @returns {Promise<KeyResource[]>}
   */
  async detectKeys(region) {
    throw new Error('Not implemented');
  }

  /**
   * Detect resource by physical ID
   * @param {string} physicalId
   * @param {string} resourceType
   * @returns {Promise<Resource|null>}
   */
  async detectResourceById(physicalId, resourceType) {
    throw new Error('Not implemented');
  }

  /**
   * Get resource properties
   * @param {string} physicalId
   * @param {string} resourceType
   * @returns {Promise<Object>}
   */
  async getResourceProperties(physicalId, resourceType) {
    throw new Error('Not implemented');
  }
}
```

### IDriftDetector

```javascript
/**
 * Port: Drift Detector Interface
 *
 * Abstracts drift detection logic
 */
class IDriftDetector {
  /**
   * Detect drift for a resource
   * @param {Resource} resource - Resource from stack
   * @param {Object} desiredProperties - Desired properties
   * @returns {Promise<PropertyMismatch[]>}
   */
  async detectDrift(resource, desiredProperties) {
    throw new Error('Not implemented');
  }

  /**
   * Detect drift for entire stack
   * @param {StackIdentifier} identifier
   * @returns {Promise<DriftDetectionResult>}
   */
  async detectStackDrift(identifier) {
    throw new Error('Not implemented');
  }
}
```

### IResourceImporter

```javascript
/**
 * Port: Resource Importer Interface
 *
 * Abstracts resource import operations
 */
class IResourceImporter {
  /**
   * Check if resource type is importable
   * @param {string} resourceType
   * @returns {boolean}
   */
  isImportable(resourceType) {
    throw new Error('Not implemented');
  }

  /**
   * Create import change set
   * @param {StackIdentifier} stackId
   * @param {Resource[]} resources
   * @returns {Promise<ImportChangeSet>}
   */
  async createImportChangeSet(stackId, resources) {
    throw new Error('Not implemented');
  }

  /**
   * Execute import operation
   * @param {ImportChangeSet} changeSet
   * @returns {Promise<ImportResult>}
   */
  async executeImport(changeSet) {
    throw new Error('Not implemented');
  }
}
```

### IPropertyReconciler

```javascript
/**
 * Port: Property Reconciler Interface
 *
 * Abstracts property reconciliation logic
 */
class IPropertyReconciler {
  /**
   * Reconcile property mismatch
   * @param {PropertyMismatch} mismatch
   * @param {Resource} resource
   * @returns {Promise<ReconciliationResult>}
   */
  async reconcile(mismatch, resource) {
    throw new Error('Not implemented');
  }

  /**
   * Plan reconciliation (dry run)
   * @param {PropertyMismatch[]} mismatches
   * @returns {Promise<ReconciliationPlan>}
   */
  async planReconciliation(mismatches) {
    throw new Error('Not implemented');
  }
}
```

---

## AWS Adapter Implementations

### AWSStackRepository

```javascript
const { CloudFormationClient, DescribeStacksCommand, ListStackResourcesCommand } = require('@aws-sdk/client-cloudformation');
const IStackRepository = require('../../application/ports/IStackRepository');

class AWSStackRepository extends IStackRepository {
  constructor({ region }) {
    super();
    this.client = new CloudFormationClient({ region });
  }

  async getStack(identifier) {
    const command = new DescribeStacksCommand({
      StackName: identifier.stackName,
    });

    try {
      const response = await this.client.send(command);
      return response.Stacks[0] || null;
    } catch (error) {
      if (error.name === 'ValidationError') {
        return null; // Stack doesn't exist
      }
      throw error;
    }
  }

  async listResources(identifier) {
    const command = new ListStackResourcesCommand({
      StackName: identifier.stackName,
    });

    const response = await this.client.send(command);

    return response.StackResourceSummaries.map(resource => ({
      logicalId: resource.LogicalResourceId,
      physicalId: resource.PhysicalResourceId,
      type: resource.ResourceType,
      status: resource.ResourceStatus,
      timestamp: resource.LastUpdatedTimestamp,
    }));
  }

  async getOutputs(identifier) {
    const stack = await this.getStack(identifier);
    if (!stack) return {};

    return (stack.Outputs || []).reduce((acc, output) => {
      acc[output.OutputKey] = output.OutputValue;
      return acc;
    }, {});
  }

  async exists(identifier) {
    return (await this.getStack(identifier)) !== null;
  }
}

module.exports = AWSStackRepository;
```

### AWSResourceDetector

```javascript
const { EC2Client, DescribeVpcsCommand, DescribeSubnetsCommand } = require('@aws-sdk/client-ec2');
const { RDSClient, DescribeDBClustersCommand } = require('@aws-sdk/client-rds');
const { KMSClient, ListKeysCommand, DescribeKeyCommand } = require('@aws-sdk/client-kms');
const IResourceDetector = require('../../application/ports/IResourceDetector');

class AWSResourceDetector extends IResourceDetector {
  constructor({ region }) {
    super();
    this.region = region;
    this.ec2 = new EC2Client({ region });
    this.rds = new RDSClient({ region });
    this.kms = new KMSClient({ region });
  }

  async detectNetworks(region) {
    const command = new DescribeVpcsCommand({});
    const response = await this.ec2.send(command);

    return response.Vpcs.map(vpc => ({
      type: 'AWS::EC2::VPC',
      physicalId: vpc.VpcId,
      properties: {
        CidrBlock: vpc.CidrBlock,
        Tags: vpc.Tags,
        IsDefault: vpc.IsDefault,
      },
    }));
  }

  async detectDatabases(region) {
    const command = new DescribeDBClustersCommand({});
    const response = await this.rds.send(command);

    return response.DBClusters.map(cluster => ({
      type: 'AWS::RDS::DBCluster',
      physicalId: cluster.DBClusterIdentifier,
      properties: {
        Engine: cluster.Engine,
        EngineVersion: cluster.EngineVersion,
        DatabaseName: cluster.DatabaseName,
        MasterUsername: cluster.MasterUsername,
        Port: cluster.Port,
      },
    }));
  }

  async detectKeys(region) {
    const listCommand = new ListKeysCommand({});
    const response = await this.kms.send(listCommand);

    const keys = [];
    for (const key of response.Keys) {
      const describeCommand = new DescribeKeyCommand({ KeyId: key.KeyId });
      const keyDetails = await this.kms.send(describeCommand);

      keys.push({
        type: 'AWS::KMS::Key',
        physicalId: keyDetails.KeyMetadata.KeyId,
        properties: {
          Description: keyDetails.KeyMetadata.Description,
          Enabled: keyDetails.KeyMetadata.Enabled,
          KeyUsage: keyDetails.KeyMetadata.KeyUsage,
        },
      });
    }

    return keys;
  }

  async detectResourceById(physicalId, resourceType) {
    // Route to appropriate detector based on resource type
    switch (resourceType) {
      case 'AWS::EC2::VPC':
        return this.detectVpcById(physicalId);
      case 'AWS::RDS::DBCluster':
        return this.detectClusterById(physicalId);
      case 'AWS::KMS::Key':
        return this.detectKeyById(physicalId);
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  }

  async getResourceProperties(physicalId, resourceType) {
    const resource = await this.detectResourceById(physicalId, resourceType);
    return resource ? resource.properties : null;
  }

  // Private helper methods
  async detectVpcById(vpcId) {
    const command = new DescribeVpcsCommand({ VpcIds: [vpcId] });
    const response = await this.ec2.send(command);
    const vpc = response.Vpcs[0];

    if (!vpc) return null;

    return {
      type: 'AWS::EC2::VPC',
      physicalId: vpc.VpcId,
      properties: {
        CidrBlock: vpc.CidrBlock,
        Tags: vpc.Tags,
        IsDefault: vpc.IsDefault,
      },
    };
  }

  async detectClusterById(clusterId) {
    const command = new DescribeDBClustersCommand({ DBClusterIdentifier: clusterId });
    try {
      const response = await this.rds.send(command);
      const cluster = response.DBClusters[0];

      return {
        type: 'AWS::RDS::DBCluster',
        physicalId: cluster.DBClusterIdentifier,
        properties: {
          Engine: cluster.Engine,
          EngineVersion: cluster.EngineVersion,
          DatabaseName: cluster.DatabaseName,
          MasterUsername: cluster.MasterUsername,
          Port: cluster.Port,
        },
      };
    } catch (error) {
      if (error.name === 'DBClusterNotFoundFault') {
        return null;
      }
      throw error;
    }
  }

  async detectKeyById(keyId) {
    const command = new DescribeKeyCommand({ KeyId: keyId });
    try {
      const response = await this.kms.send(command);
      return {
        type: 'AWS::KMS::Key',
        physicalId: response.KeyMetadata.KeyId,
        properties: {
          Description: response.KeyMetadata.Description,
          Enabled: response.KeyMetadata.Enabled,
          KeyUsage: response.KeyMetadata.KeyUsage,
        },
      };
    } catch (error) {
      if (error.name === 'NotFoundException') {
        return null;
      }
      throw error;
    }
  }
}

module.exports = AWSResourceDetector;
```

---

## Provider Registry

### registry.js

```javascript
/**
 * Provider Registry
 *
 * Maps provider names to their implementations
 */

class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.registerBuiltInProviders();
  }

  registerBuiltInProviders() {
    // Register AWS (available today)
    this.register('aws', require('./aws-provider'));

    // Register GCP (future - throws helpful error)
    this.register('gcp', {
      name: 'GCP',
      available: false,
      message: 'GCP support is planned but not yet implemented',
    });

    // Register Azure (future - throws helpful error)
    this.register('azure', {
      name: 'Azure',
      available: false,
      message: 'Azure support is planned but not yet implemented',
    });
  }

  register(name, provider) {
    this.providers.set(name, provider);
  }

  get(name) {
    const provider = this.providers.get(name);

    if (!provider) {
      throw new Error(`Unknown provider: ${name}. Supported providers: ${Array.from(this.providers.keys()).join(', ')}`);
    }

    if (provider.available === false) {
      throw new Error(`${provider.name} provider is not yet available. ${provider.message}`);
    }

    return provider;
  }

  isAvailable(name) {
    const provider = this.providers.get(name);
    return provider && provider.available !== false;
  }

  getSupportedProviders() {
    return Array.from(this.providers.keys()).filter(name => this.isAvailable(name));
  }
}

module.exports = new ProviderRegistry();
```

### aws-provider.js

```javascript
/**
 * AWS Provider Definition
 *
 * Factory for AWS-specific implementations
 */

const AWSStackRepository = require('../domains/health/infrastructure/adapters/aws/AWSStackRepository');
const AWSResourceDetector = require('../domains/health/infrastructure/adapters/aws/AWSResourceDetector');
const AWSDriftDetector = require('../domains/health/infrastructure/adapters/aws/AWSDriftDetector');
const AWSResourceImporter = require('../domains/health/infrastructure/adapters/aws/AWSResourceImporter');
const AWSPropertyReconciler = require('../domains/health/infrastructure/adapters/aws/AWSPropertyReconciler');

// Domain builders
const VpcBuilder = require('../domains/networking/aws/vpc-builder');
const KmsBuilder = require('../domains/security/aws/kms-builder');
const AuroraBuilder = require('../domains/database/aws/aurora-builder');
const MigrationBuilder = require('../domains/database/aws/migration-builder');

module.exports = {
  name: 'AWS',
  available: true,

  /**
   * Create health check adapters for AWS
   */
  createHealthAdapters({ region }) {
    return {
      stackRepository: new AWSStackRepository({ region }),
      resourceDetector: new AWSResourceDetector({ region }),
      driftDetector: new AWSDriftDetector({ region }),
      resourceImporter: new AWSResourceImporter({ region }),
      propertyReconciler: new AWSPropertyReconciler({ region }),
    };
  },

  /**
   * Get infrastructure builders for AWS
   */
  getBuilders() {
    return [
      new VpcBuilder(),
      new KmsBuilder(),
      new AuroraBuilder(),
      new MigrationBuilder(),
    ];
  },

  /**
   * Get supported resource types
   */
  getSupportedResourceTypes() {
    return [
      'AWS::EC2::VPC',
      'AWS::EC2::Subnet',
      'AWS::EC2::SecurityGroup',
      'AWS::RDS::DBCluster',
      'AWS::RDS::DBInstance',
      'AWS::KMS::Key',
      'AWS::Lambda::Function',
      'AWS::SQS::Queue',
      'AWS::S3::Bucket',
      // ... more
    ];
  },

  /**
   * Get resource property metadata
   */
  getResourceMetadata(resourceType) {
    return require(`./metadata/${resourceType.replace(/::/g, '_')}.json`);
  },
};
```

---

## Use Case Integration with Providers

### RunHealthCheckUseCase

```javascript
const ProviderRegistry = require('../../../providers/registry');

class RunHealthCheckUseCase {
  /**
   * @param {Object} dependencies - Injected dependencies (optional)
   */
  constructor(dependencies = {}) {
    this.dependencies = dependencies;
  }

  /**
   * Execute health check
   *
   * @param {Object} params
   * @param {string} params.stackName - CloudFormation stack name
   * @param {string} params.region - Cloud provider region
   * @param {string} params.provider - Provider name ('aws', 'gcp', 'azure')
   * @param {Object} params.appDefinition - App definition (desired state)
   */
  async execute({ stackName, region, provider, appDefinition }) {
    // Get provider-specific adapters
    const providerImpl = ProviderRegistry.get(provider);
    const adapters = this.dependencies.adapters || providerImpl.createHealthAdapters({ region });

    // Step 1: Get stack state
    const stackIdentifier = new StackIdentifier({ stackName, region });
    const stack = await adapters.stackRepository.getStack(stackIdentifier);

    if (!stack) {
      return StackHealthReport.createForMissingStack(stackIdentifier);
    }

    // Step 2: Discover resources
    const stackResources = await adapters.stackRepository.listResources(stackIdentifier);
    const cloudResources = await this.discoverCloudResources(adapters.resourceDetector, region);

    // Step 3: Detect issues
    const orphanedResources = this.detectOrphaned(stackResources, cloudResources);
    const missingResources = this.detectMissing(stackResources, cloudResources);
    const driftedResources = await this.detectDrift(stackResources, cloudResources, adapters.driftDetector);

    // Step 4: Calculate health score
    const healthScore = HealthScoreCalculator.calculate({
      orphaned: orphanedResources.length,
      missing: missingResources.length,
      drifted: driftedResources.length,
      total: stackResources.length,
    });

    // Step 5: Build health report
    return new StackHealthReport({
      stackIdentifier,
      healthScore,
      orphanedResources,
      missingResources,
      driftedResources,
    });
  }

  async discoverCloudResources(detector, region) {
    const [networks, databases, keys] = await Promise.all([
      detector.detectNetworks(region),
      detector.detectDatabases(region),
      detector.detectKeys(region),
    ]);

    return [...networks, ...databases, ...keys];
  }

  detectOrphaned(stackResources, cloudResources) {
    // Resources in cloud but not in stack
    const stackPhysicalIds = new Set(stackResources.map(r => r.physicalId));
    return cloudResources.filter(r => !stackPhysicalIds.has(r.physicalId));
  }

  detectMissing(stackResources, cloudResources) {
    // Resources in stack but not in cloud
    const cloudPhysicalIds = new Set(cloudResources.map(r => r.physicalId));
    return stackResources.filter(r => !cloudPhysicalIds.has(r.physicalId));
  }

  async detectDrift(stackResources, cloudResources, driftDetector) {
    const drifted = [];

    for (const stackResource of stackResources) {
      const cloudResource = cloudResources.find(r => r.physicalId === stackResource.physicalId);

      if (cloudResource) {
        const mismatches = await driftDetector.detectDrift(stackResource, cloudResource.properties);

        if (mismatches.length > 0) {
          drifted.push({
            resource: stackResource,
            mismatches,
          });
        }
      }
    }

    return drifted;
  }
}

module.exports = RunHealthCheckUseCase;
```

---

## CLI Command Integration

### doctor-command.js

```javascript
const ProviderRegistry = require('../../providers/registry');
const RunHealthCheckUseCase = require('../../domains/health/application/use-cases/run-health-check-use-case');
const HealthReportPresenter = require('./presenters/health-report-presenter');

async function doctorCommand(options) {
  console.log('🩺 Running infrastructure health check...\n');

  // Load app definition
  const appDefinition = loadAppDefinition();
  const provider = options.provider || appDefinition.provider || 'aws';
  const region = options.region || appDefinition.region;
  const stackName = options.stack || `${appDefinition.name}-${options.stage || 'dev'}`;

  // Verify provider is supported
  if (!ProviderRegistry.isAvailable(provider)) {
    console.error(`❌ Provider '${provider}' is not supported`);
    console.log(`Supported providers: ${ProviderRegistry.getSupportedProviders().join(', ')}`);
    process.exit(1);
  }

  // Create use case (adapters created automatically based on provider)
  const useCase = new RunHealthCheckUseCase();

  // Execute health check
  const report = await useCase.execute({
    stackName,
    region,
    provider,
    appDefinition,
  });

  // Present results
  const presenter = new HealthReportPresenter({ format: options.format || 'table' });
  presenter.present(report);

  // Exit with code based on health score (if requested)
  if (options.exitCode) {
    if (report.healthScore.isHealthy()) {
      process.exit(0);
    } else if (report.healthScore.isDegraded()) {
      process.exit(1);
    } else {
      process.exit(2);
    }
  }
}

module.exports = doctorCommand;
```

---

## Extension Points for Future Providers

### Adding GCP Support

To add GCP support in the future:

1. **Create GCP adapters**:
   ```
   infrastructure/domains/health/infrastructure/adapters/gcp/
   ├── GCPStackRepository.js       # Deployment Manager
   ├── GCPResourceDetector.js      # GCP APIs
   ├── GCPDriftDetector.js
   ├── GCPResourceImporter.js
   └── GCPPropertyReconciler.js
   ```

2. **Create GCP builders**:
   ```
   infrastructure/domains/networking/gcp/network-builder.js
   infrastructure/domains/database/gcp/cloud-sql-builder.js
   infrastructure/domains/security/gcp/kms-builder.js
   ```

3. **Register GCP provider**:
   ```javascript
   // providers/gcp-provider.js
   module.exports = {
     name: 'GCP',
     available: true,
     createHealthAdapters({ region }) { ... },
     getBuilders() { ... },
     getSupportedResourceTypes() { ... },
   };
   ```

4. **Update registry**:
   ```javascript
   // providers/registry.js
   this.register('gcp', require('./gcp-provider'));
   ```

**No changes required to**:
- Domain entities (Resource, Issue, StackHealthReport)
- Value objects (HealthScore, ResourceState)
- Use cases (RunHealthCheckUseCase, RepairStackViaImportUseCase)
- CLI commands (doctor-command.js, repair-command.js)

The hexagonal architecture ensures new providers only require implementing the port interfaces!

---

## Summary

This architecture achieves:

✅ **Multi-cloud ready** - Ports & Adapters make provider swapping trivial
✅ **Provider-specific domains clear** - Obvious where AWS/GCP/Azure diverge
✅ **Testable** - Mock port interfaces for unit tests
✅ **Extensible** - Add new providers without touching domain logic
✅ **Explicit** - Provider selection obvious in app definition
✅ **Future-proof** - Non-serverless (Docker) can be added as another provider

**AWS works today**, and the path to GCP/Azure/Cloudflare is clear and isolated to adapter implementations.
