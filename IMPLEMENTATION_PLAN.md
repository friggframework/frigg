# Implementation Plan: Clean Resource Architecture

## Decision Summary

- ✅ Three-layer architecture (Ownership → Discovery → Resolution)
- ✅ All builders refactored (VPC, Aurora, KMS, SSM, Migration, Integration, Websocket)
- ✅ No backwards compatibility with old `management` modes
- ✅ Wait for full refactor before deploying
- ⏳ Terminology decision needed: `ownership` | `manage` | `source` | `control`

## Core Principles

1. **Don't include resources removed from app definition**
   - If user removes a resource config, don't add it to template
   - Clean slate on each deploy based on current app definition

2. **Don't duplicate Serverless Framework**
   - Serverless handles: Lambda functions, API Gateway, basic IAM, packaging
   - We handle: VPC, Aurora, KMS, SSM, custom integrations, migrations
   - Don't touch what Serverless manages natively

3. **Clear separation of concerns**
   - Discovery reports facts
   - Resolution makes decisions
   - Builders implement decisions

## Phase 1: Core Foundation (Week 1)

### 1.1 Define New Schema & Types
**Files to create:**
- `domains/shared/types/resource-ownership.ts`
- `domains/shared/types/discovery-result.ts`
- `domains/shared/types/app-definition.ts`

```typescript
// resource-ownership.ts
export enum ResourceOwnership {
    STACK,      // Managed by our CloudFormation stack
    EXTERNAL,   // Managed elsewhere, we just reference
    AUTO        // Let system decide based on discovery
}

export interface ResourceDecision {
    ownership: ResourceOwnership;
    physicalId?: string;           // For EXTERNAL
    physicalIds?: string[];        // For EXTERNAL (arrays)
    reason: string;                // Why this decision was made
}

// discovery-result.ts
export interface StackManagedResource {
    logicalId: string;
    physicalId: string;
    resourceType: string;
    properties?: any;
}

export interface ExternalResource {
    physicalId: string;
    resourceType: string;
    source: 'tag-search' | 'name-search' | 'aws-api' | 'user-provided';
    properties?: any;
}

export interface DiscoveryResult {
    stackManaged: StackManagedResource[];
    external: ExternalResource[];
    stackName?: string;
    fromCloudFormation: boolean;
}

// app-definition.ts
export interface VpcDefinition {
    enable: boolean;

    // Resource ownership intent (TERM TBD: ownership | manage | source | control)
    ownership: {
        vpc?: 'stack' | 'external' | 'auto';
        securityGroup?: 'stack' | 'external' | 'auto';
        subnets?: 'stack' | 'external' | 'auto';
        natGateway?: 'stack' | 'external' | 'auto';
        vpcEndpoints?: 'stack' | 'external' | 'auto';
    };

    // External resource references (required if ownership = 'external')
    external?: {
        vpcId?: string;
        securityGroupIds?: string[];
        subnetIds?: string[];
        natGatewayId?: string;
        vpcEndpointIds?: {
            s3?: string;
            dynamodb?: string;
            kms?: string;
            secretsManager?: string;
            sqs?: string;
        };
    };

    // Configuration preferences
    config?: {
        selfHeal?: boolean;           // Auto-configure NAT/routes/etc
        cidrBlock?: string;           // For stack-owned VPC
        enableVpcEndpoints?: boolean;
        natGateway?: {
            enable?: boolean;
        };
    };
}

export interface AuroraDefinition {
    enable: boolean;

    ownership: {
        cluster?: 'stack' | 'external' | 'auto';
        subnetGroup?: 'stack' | 'external' | 'auto';
        secret?: 'stack' | 'external' | 'auto';
    };

    external?: {
        clusterId?: string;
        clusterEndpoint?: string;
        secretArn?: string;
    };

    config?: {
        engine?: 'aurora-postgresql' | 'aurora-mysql';
        minCapacity?: number;
        maxCapacity?: number;
        database?: string;
        publiclyAccessible?: boolean;
        autoCreateCredentials?: boolean;
    };
}

export interface KmsDefinition {
    enable: boolean;

    ownership: {
        key?: 'stack' | 'external' | 'auto';
    };

    external?: {
        keyId?: string;
        keyAlias?: string;
    };

    config?: {
        enableKeyRotation?: boolean;
        description?: string;
    };
}
```

### 1.2 Refactor Discovery System
**Files to modify:**
- `domains/shared/resource-discovery.js` → `resource-discovery.ts`
- `domains/shared/cloudformation-discovery.js` → `cloudformation-discovery.ts`

**New behavior:**
```typescript
async function discoverResources(appDefinition: AppDefinition): Promise<DiscoveryResult> {
    const result: DiscoveryResult = {
        stackManaged: [],
        external: [],
        fromCloudFormation: false
    };

    // Step 1: Always query CloudFormation stack
    const stackName = `${appDefinition.name}-${appDefinition.stage}`;
    try {
        const stack = await queryCloudFormationStack(stackName);
        result.fromCloudFormation = true;
        result.stackName = stackName;
        result.stackManaged = stack.resources;
    } catch (e) {
        // Stack doesn't exist - that's fine
    }

    // Step 2: Query external resources based on what's enabled
    if (appDefinition.vpc?.enable) {
        result.external.push(...await discoverExternalVpcResources(appDefinition));
    }

    if (appDefinition.database?.postgres?.enable) {
        result.external.push(...await discoverExternalAuroraResources(appDefinition));
    }

    if (appDefinition.encryption?.enable) {
        result.external.push(...await discoverExternalKmsResources(appDefinition));
    }

    return result;
}
```

### 1.3 Create Base Resolver Class
**Files to create:**
- `domains/shared/base-resolver.ts`

```typescript
export abstract class ResourceResolver {
    /**
     * Resolve ownership for a specific resource
     * @param resourceName - e.g., 'FriggLambdaSecurityGroup'
     * @param userIntent - What user specified in app definition
     * @param discovery - Discovery results
     */
    abstract resolve(
        resourceName: string,
        userIntent: 'stack' | 'external' | 'auto' | undefined,
        discovery: DiscoveryResult
    ): ResourceDecision;

    /**
     * Helper: Check if resource is in our CloudFormation stack
     */
    protected isInStack(logicalId: string, discovery: DiscoveryResult): StackManagedResource | null {
        return discovery.stackManaged.find(r => r.logicalId === logicalId) || null;
    }

    /**
     * Helper: Find external resource by type
     */
    protected findExternal(
        resourceType: string,
        discovery: DiscoveryResult
    ): ExternalResource | null {
        return discovery.external.find(r => r.resourceType === resourceType) || null;
    }

    /**
     * Helper: Validate external resource IDs are provided
     */
    protected requireExternalIds(
        resourceIds: any,
        resourceName: string
    ): void {
        if (!resourceIds) {
            throw new Error(
                `ownership='external' for ${resourceName} requires external.${resourceName} to be provided`
            );
        }
    }
}
```

## Phase 2: VPC Builder (Week 2)

### 2.1 VPC Resolver
**Files to create:**
- `domains/networking/vpc-resolver.ts`

```typescript
export class VpcResourceResolver extends ResourceResolver {
    resolveSecurityGroup(
        appDefinition: AppDefinition,
        discovery: DiscoveryResult
    ): ResourceDecision {
        const userIntent = appDefinition.vpc?.ownership?.securityGroup || 'auto';

        // Explicit external
        if (userIntent === 'external') {
            this.requireExternalIds(
                appDefinition.vpc?.external?.securityGroupIds,
                'securityGroupIds'
            );
            return {
                ownership: ResourceOwnership.EXTERNAL,
                physicalIds: appDefinition.vpc.external.securityGroupIds,
                reason: 'User specified ownership=external'
            };
        }

        // Explicit stack
        if (userIntent === 'stack') {
            const inStack = this.isInStack('FriggLambdaSecurityGroup', discovery);
            return {
                ownership: ResourceOwnership.STACK,
                physicalId: inStack?.physicalId,
                reason: 'User specified ownership=stack'
            };
        }

        // Auto-decide
        const inStack = this.isInStack('FriggLambdaSecurityGroup', discovery);
        if (inStack) {
            // CRITICAL: Resource is in our stack - MUST keep in template
            return {
                ownership: ResourceOwnership.STACK,
                physicalId: inStack.physicalId,
                reason: 'Found in CloudFormation stack (must keep in template to avoid deletion)'
            };
        }

        const external = this.findExternal('AWS::EC2::SecurityGroup', discovery);
        if (external) {
            return {
                ownership: ResourceOwnership.EXTERNAL,
                physicalIds: [external.physicalId],
                reason: 'Found external security group via discovery'
            };
        }

        return {
            ownership: ResourceOwnership.STACK,
            reason: 'No existing security group found - will create in stack'
        };
    }

    resolveVpc(appDefinition: AppDefinition, discovery: DiscoveryResult): ResourceDecision {
        // Similar logic...
    }

    resolveSubnets(appDefinition: AppDefinition, discovery: DiscoveryResult): ResourceDecision {
        // Similar logic...
    }

    resolveNatGateway(appDefinition: AppDefinition, discovery: DiscoveryResult): ResourceDecision {
        // Similar logic...
    }

    resolveVpcEndpoints(appDefinition: AppDefinition, discovery: DiscoveryResult): ResourceDecision {
        // Similar logic...
    }
}
```

### 2.2 Refactor VPC Builder
**Files to modify:**
- `domains/networking/vpc-builder.js` → `vpc-builder.ts`

**Key changes:**
```typescript
export class VpcBuilder extends InfrastructureBuilder {
    async build(appDefinition: AppDefinition, discovery: DiscoveryResult): Promise<BuildResult> {
        console.log('[VpcBuilder] Building VPC infrastructure...');

        // If VPC not enabled in app definition, return empty result
        if (!appDefinition.vpc?.enable) {
            console.log('  VPC not enabled in app definition - skipping');
            return { resources: {}, vpcConfig: {}, environment: {} };
        }

        const result: BuildResult = {
            resources: {},
            vpcConfig: { subnetIds: [], securityGroupIds: [] },
            environment: {}
        };

        const resolver = new VpcResourceResolver();

        // Resolve ownership for each resource
        const decisions = {
            vpc: resolver.resolveVpc(appDefinition, discovery),
            securityGroup: resolver.resolveSecurityGroup(appDefinition, discovery),
            subnets: resolver.resolveSubnets(appDefinition, discovery),
            natGateway: resolver.resolveNatGateway(appDefinition, discovery),
            vpcEndpoints: resolver.resolveVpcEndpoints(appDefinition, discovery)
        };

        console.log('  Resource ownership decisions:');
        console.log(`    VPC: ${decisions.vpc.ownership} - ${decisions.vpc.reason}`);
        console.log(`    Security Group: ${decisions.securityGroup.ownership} - ${decisions.securityGroup.reason}`);
        console.log(`    Subnets: ${decisions.subnets.ownership} - ${decisions.subnets.reason}`);

        // Build each resource based on decision
        this.buildVpc(decisions.vpc, appDefinition, discovery, result);
        this.buildSecurityGroup(decisions.securityGroup, appDefinition, discovery, result);
        this.buildSubnets(decisions.subnets, appDefinition, discovery, result);
        this.buildNatGateway(decisions.natGateway, appDefinition, discovery, result);
        this.buildVpcEndpoints(decisions.vpcEndpoints, appDefinition, discovery, result);

        // Self-heal configuration (if enabled)
        if (appDefinition.vpc.config?.selfHeal) {
            this.selfHealConfiguration(decisions, appDefinition, result);
        }

        return result;
    }

    buildSecurityGroup(
        decision: ResourceDecision,
        appDefinition: AppDefinition,
        discovery: DiscoveryResult,
        result: BuildResult
    ): void {
        if (decision.ownership === ResourceOwnership.STACK) {
            // Add to CloudFormation template
            result.resources.FriggLambdaSecurityGroup = {
                Type: 'AWS::EC2::SecurityGroup',
                Properties: {
                    VpcId: this.getVpcId(discovery, result),
                    GroupDescription: 'Security group for Frigg Lambda functions',
                    SecurityGroupEgress: [
                        { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, CidrIp: '0.0.0.0/0' },
                        { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0' },
                        { IpProtocol: 'tcp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0' },
                        { IpProtocol: 'udp', FromPort: 53, ToPort: 53, CidrIp: '0.0.0.0/0' },
                        { IpProtocol: 'tcp', FromPort: 5432, ToPort: 5432, CidrIp: '0.0.0.0/0' },
                        { IpProtocol: 'tcp', FromPort: 27017, ToPort: 27017, CidrIp: '0.0.0.0/0' }
                    ],
                    Tags: [
                        { Key: 'Name', Value: '${self:service}-${self:provider.stage}-lambda-sg' },
                        { Key: 'ManagedBy', Value: 'Frigg' }
                    ]
                }
            };

            // Reference via Ref (it's in the template)
            result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];

            console.log(`  ✅ Security Group: ${decision.reason}`);
            if (decision.physicalId) {
                console.log(`  ℹ️  Physical ID: ${decision.physicalId} (CloudFormation will not recreate)`);
            }

        } else if (decision.ownership === ResourceOwnership.EXTERNAL) {
            // Don't add to template - just reference by physical ID
            result.vpcConfig.securityGroupIds = decision.physicalIds!;

            console.log(`  ✅ Security Group: ${decision.reason}`);
            console.log(`  ℹ️  Referencing external IDs: ${decision.physicalIds!.join(', ')}`);
        }
    }

    // Similar for other resources...
}
```

### 2.3 Update VPC Tests
**Files to modify:**
- `domains/networking/__tests__/vpc-builder.test.ts`

**Test cases:**
1. Fresh deploy (no stack, no external) → All resources ownership=STACK
2. Redeploy existing stack → Resources in stack ownership=STACK
3. External VPC provided → VPC ownership=EXTERNAL, others STACK
4. Mixed: external VPC + stack subnets
5. Resource removed from app definition → Not in template
6. User explicit ownership=external without IDs → Error

## Phase 3: Aurora Builder (Week 2-3)

### 3.1 Aurora Resolver
**Files to create:**
- `domains/database/aurora-resolver.ts`

### 3.2 Refactor Aurora Builder
**Files to modify:**
- `domains/database/aurora-builder.js` → `aurora-builder.ts`

### 3.3 Update Aurora Tests
**Files to modify:**
- `domains/database/__tests__/aurora-builder.test.ts`

## Phase 4: Other Builders (Week 3)

### 4.1 KMS Builder
- `domains/security/kms-resolver.ts`
- `domains/security/kms-builder.ts`

### 4.2 SSM Builder
- `domains/parameters/ssm-resolver.ts`
- `domains/parameters/ssm-builder.ts`

### 4.3 Migration Builder
- `domains/database/migration-builder.ts` (simpler, mostly creates new resources)

### 4.4 Integration Builder
- `domains/integration/integration-builder.ts` (simpler, mostly creates new resources)

### 4.5 Websocket Builder
- `domains/integration/websocket-builder.ts` (simpler, mostly creates new resources)

## Phase 5: Integration & Testing (Week 4)

### 5.1 Update Builder Orchestrator
**Files to modify:**
- `domains/shared/builder-orchestrator.js` → `builder-orchestrator.ts`

**Changes:**
- Pass typed `DiscoveryResult` to all builders
- Remove old backwards compatibility logic
- Simplified flow

### 5.2 Update Infrastructure Composer
**Files to modify:**
- `infrastructure-composer.js` → `infrastructure-composer.ts`

### 5.3 Integration Tests
**Files to create:**
- `__tests__/integration/full-stack-deployment.test.ts`
- `__tests__/integration/external-resources.test.ts`
- `__tests__/integration/mixed-ownership.test.ts`

### 5.4 Update Documentation
**Files to modify:**
- `README.md` - New app definition schema
- `docs/VPC-CONFIGURATION.md` - New ownership syntax
- `docs/AURORA-CONFIGURATION.md` - New ownership syntax
- `docs/MIGRATION-GUIDE.md` - How to migrate from old to new schema

## Phase 6: Breaking Changes & Migration (Week 4)

### 6.1 Remove Old Code
- Delete all `management: 'discover' | 'create-new' | 'use-existing'` logic
- Remove legacy compatibility layers
- Clean up unused functions

### 6.2 Add Schema Validation
- Validate new app definition schema
- Clear error messages for missing required fields
- Helpful suggestions for common mistakes

### 6.3 Migration Script (Optional)
**Files to create:**
- `scripts/migrate-app-definition.js`

Helps users migrate old app definitions to new schema:
```bash
node scripts/migrate-app-definition.js backend/index.js
```

## Timeline Summary

| Week | Focus | Deliverables |
|------|-------|-------------|
| 1 | Foundation | Core types, discovery refactor, base resolver |
| 2 | VPC & Aurora | VPC builder refactor, Aurora builder refactor, tests |
| 3 | Other Builders | KMS, SSM, Migration, Integration, Websocket |
| 4 | Integration | Orchestrator, composer, integration tests, docs |

## Success Criteria

- [ ] All builders use new ownership system
- [ ] No backwards compatibility with old `management` modes
- [ ] Resources in stack always added to template (no deletion)
- [ ] External resources never added to template (no conflicts)
- [ ] Resources removed from app definition not in template
- [ ] Clear, helpful error messages
- [ ] All tests passing (unit + integration)
- [ ] Documentation updated
- [ ] Self-heal only affects configuration, not ownership

## Risk Mitigation

1. **Breaking changes for existing users:**
   - Risk: LOW (very few adopters)
   - Mitigation: Clear migration guide, helpful error messages

2. **Complex refactor across many files:**
   - Risk: MEDIUM
   - Mitigation: Incremental approach, TDD, thorough testing

3. **CloudFormation edge cases:**
   - Risk: MEDIUM
   - Mitigation: Comprehensive integration tests, staging environment testing

## Questions to Answer Before Starting

1. ✅ Terminology: Which term? (`ownership` | `manage` | `source` | `control`)
2. Should we convert to TypeScript now, or keep JavaScript?
3. Any specific builders that need different handling?
4. Staging environment available for testing?
