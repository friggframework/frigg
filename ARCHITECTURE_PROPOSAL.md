# Clean Architecture Proposal: Resource Lifecycle Management

## Problem Statement

The current infrastructure builder system conflates:
1. **Resource lifecycle** (who owns/manages the resource)
2. **Resource discovery** (how we find existing resources)
3. **Configuration strategy** (how we configure/self-heal)

This leads to:
- Inconsistent behavior between builders
- Difficulty reasoning about what will happen
- CloudFormation errors when resources are referenced incorrectly
- Confusion about when resources are created vs. reused

## Proposed Solution: Three-Layer Architecture

### Layer 1: Resource Lifecycle (Ownership)

Every resource has ONE of these lifecycle states:

```typescript
enum ResourceLifecycle {
    MANAGED,           // CloudFormation manages it (in THIS stack's template)
    EXTERNAL,          // Exists outside, we just reference it (by physical ID)
    CREATE_NEW         // Doesn't exist, create it now
}
```

**Key Rule:** If a resource is `MANAGED`, it MUST be in the CloudFormation template on every deploy, or CloudFormation will delete it.

### Layer 2: Resource Discovery (How We Find It)

Discovery determines what exists and WHERE:

```typescript
interface DiscoveryResult {
    // Resources that are IN our CloudFormation stack
    stackManaged: {
        logicalId: string;
        physicalId: string;
        resourceType: string;
        properties: any;
    }[];

    // Resources that exist OUTSIDE our stack
    external: {
        physicalId: string;
        resourceType: string;
        source: 'tag-search' | 'name-search' | 'vpc-default' | 'user-provided';
        properties: any;
    }[];

    // Metadata
    stackName?: string;
    fromCloudFormation: boolean;
}
```

Discovery never makes decisions - it just reports facts.

### Layer 3: Resource Resolution (Decision Making)

Each builder decides the lifecycle based on:
1. App definition (user intent)
2. Discovery results (what exists)
3. Builder-specific logic

```typescript
class ResourceResolver {
    resolve(
        appDefinition: AppDefinition,
        discoveryResult: DiscoveryResult,
        resourceName: string
    ): ResourceDecision {
        // Returns: MANAGED | EXTERNAL | CREATE_NEW
    }
}
```

## Detailed Design

### 1. App Definition Schema

```typescript
interface VpcConfig {
    enable: boolean;

    // Resource lifecycle intent
    lifecycle: {
        vpc: 'managed' | 'external' | 'auto';           // Explicit or auto-decide
        securityGroup: 'managed' | 'external' | 'auto';
        subnets: 'managed' | 'external' | 'auto';
        natGateway: 'managed' | 'external' | 'auto';
        vpcEndpoints: 'managed' | 'external' | 'auto';
    };

    // External resource references (when lifecycle = 'external')
    external: {
        vpcId?: string;
        securityGroupIds?: string[];
        subnetIds?: string[];
        natGatewayId?: string;
    };

    // Configuration preferences
    config: {
        selfHeal: boolean;              // Auto-configure missing pieces
        cidrBlock?: string;             // For managed VPC
        enableVpcEndpoints: boolean;
    };

    // Legacy compatibility (deprecated)
    management?: 'discover' | 'create-new' | 'use-existing';  // Maps to lifecycle
}
```

### 2. Discovery Flow

```typescript
async function discoverResources(appDefinition: AppDefinition): Promise<DiscoveryResult> {
    const stackName = `${appDefinition.name}-${appDefinition.stage}`;
    const result: DiscoveryResult = {
        stackManaged: [],
        external: [],
        fromCloudFormation: false
    };

    // Step 1: Query CloudFormation stack
    try {
        const stack = await cloudformation.describeStacks({ StackName: stackName });
        result.fromCloudFormation = true;
        result.stackName = stackName;

        const resources = await cloudformation.listStackResources({ StackName: stackName });
        result.stackManaged = resources.map(r => ({
            logicalId: r.LogicalResourceId,
            physicalId: r.PhysicalResourceId,
            resourceType: r.ResourceType,
            properties: {}  // Could query details if needed
        }));
    } catch (e) {
        // Stack doesn't exist - that's okay
    }

    // Step 2: Query AWS for external resources (if requested)
    if (appDefinition.vpc?.enable) {
        // Only search if user didn't provide explicit IDs
        if (!appDefinition.vpc.external?.vpcId) {
            const vpcs = await ec2.describeVpcs({
                Filters: [
                    { Name: 'tag:ManagedBy', Values: ['Frigg'] },
                    { Name: 'tag:Stage', Values: [appDefinition.stage] }
                ]
            });

            vpcs.forEach(vpc => {
                result.external.push({
                    physicalId: vpc.VpcId,
                    resourceType: 'AWS::EC2::VPC',
                    source: 'tag-search',
                    properties: { CidrBlock: vpc.CidrBlock }
                });
            });
        }
    }

    return result;
}
```

### 3. Resource Resolution Logic

```typescript
class VpcResourceResolver {
    resolve(appDefinition: AppDefinition, discovery: DiscoveryResult) {
        const decisions = {
            vpc: this.resolveVpc(appDefinition, discovery),
            securityGroup: this.resolveSecurityGroup(appDefinition, discovery),
            subnets: this.resolveSubnets(appDefinition, discovery),
            natGateway: this.resolveNatGateway(appDefinition, discovery),
        };

        return decisions;
    }

    resolveSecurityGroup(appDefinition: AppDefinition, discovery: DiscoveryResult): ResourceDecision {
        const lifecycle = appDefinition.vpc.lifecycle?.securityGroup || 'auto';

        // Explicit external
        if (lifecycle === 'external') {
            if (!appDefinition.vpc.external?.securityGroupIds) {
                throw new Error('lifecycle=external requires external.securityGroupIds');
            }
            return {
                lifecycle: ResourceLifecycle.EXTERNAL,
                physicalIds: appDefinition.vpc.external.securityGroupIds,
                reason: 'User specified lifecycle=external'
            };
        }

        // Explicit managed
        if (lifecycle === 'managed') {
            return {
                lifecycle: ResourceLifecycle.MANAGED,
                reason: 'User specified lifecycle=managed'
            };
        }

        // Auto-decide
        const inStack = discovery.stackManaged.find(r =>
            r.logicalId === 'FriggLambdaSecurityGroup'
        );

        if (inStack) {
            // CRITICAL: If it's in our stack, it MUST stay in template
            return {
                lifecycle: ResourceLifecycle.MANAGED,
                physicalId: inStack.physicalId,
                reason: 'Found in CloudFormation stack - must keep in template'
            };
        }

        const external = discovery.external.find(r =>
            r.resourceType === 'AWS::EC2::SecurityGroup'
        );

        if (external) {
            return {
                lifecycle: ResourceLifecycle.EXTERNAL,
                physicalIds: [external.physicalId],
                reason: 'Found external security group via discovery'
            };
        }

        return {
            lifecycle: ResourceLifecycle.CREATE_NEW,
            reason: 'No existing security group found'
        };
    }
}
```

### 4. Builder Implementation

```typescript
class VpcBuilder {
    async build(appDefinition: AppDefinition, discovery: DiscoveryResult) {
        const resolver = new VpcResourceResolver();
        const decisions = resolver.resolve(appDefinition, discovery);

        const result = {
            resources: {},
            vpcConfig: { subnetIds: [], securityGroupIds: [] },
            environment: {}
        };

        // Build VPC based on decision
        this.buildVpc(decisions.vpc, appDefinition, result);

        // Build Security Group based on decision
        this.buildSecurityGroup(decisions.securityGroup, appDefinition, discovery, result);

        // Build Subnets based on decision
        this.buildSubnets(decisions.subnets, appDefinition, discovery, result);

        // Self-heal (configuration layer)
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
    ) {
        switch (decision.lifecycle) {
            case ResourceLifecycle.MANAGED:
            case ResourceLifecycle.CREATE_NEW:
                // Add to CloudFormation template
                result.resources.FriggLambdaSecurityGroup = {
                    Type: 'AWS::EC2::SecurityGroup',
                    Properties: {
                        VpcId: this.resolveVpcId(decision, discovery),
                        GroupDescription: 'Security group for Frigg Lambda functions',
                        SecurityGroupEgress: [ /* ... */ ],
                        Tags: [ /* ... */ ]
                    }
                };

                // Reference via Ref (it's in the template)
                result.vpcConfig.securityGroupIds = [{ Ref: 'FriggLambdaSecurityGroup' }];

                console.log(`  ✅ Security group: ${decision.reason}`);
                if (decision.lifecycle === ResourceLifecycle.MANAGED) {
                    console.log(`  ℹ️  Using physical ID: ${decision.physicalId} (will not recreate)`);
                }
                break;

            case ResourceLifecycle.EXTERNAL:
                // DO NOT add to template - just reference by ID
                result.vpcConfig.securityGroupIds = decision.physicalIds;

                console.log(`  ✅ Security group: ${decision.reason}`);
                console.log(`  ℹ️  Referencing external IDs: ${decision.physicalIds.join(', ')}`);
                break;
        }
    }

    selfHealConfiguration(
        decisions: ResourceDecisions,
        appDefinition: AppDefinition,
        result: BuildResult
    ) {
        console.log('🔧 Self-heal: Configuring optimal settings...');

        // Auto-configure NAT Gateway if needed
        if (decisions.natGateway.lifecycle === ResourceLifecycle.CREATE_NEW) {
            console.log('  ℹ️  Auto-configuring NAT Gateway in public subnet');
            // Add NAT gateway configuration
        }

        // Auto-associate route tables
        if (result.resources.FriggPrivateSubnet1 && result.resources.FriggLambdaRouteTable) {
            console.log('  ℹ️  Auto-associating subnets with route table');
            // Add associations
        }

        // This is about CONFIGURATION, not about resource lifecycle
    }
}
```

## Migration Strategy

### Phase 1: Add New Schema (Backwards Compatible)

Add new `lifecycle` and `external` config while keeping old `management` working:

```javascript
function mapLegacyToLifecycle(management) {
    switch (management) {
        case 'create-new': return 'managed';
        case 'use-existing': return 'external';
        case 'discover': return 'auto';
        default: return 'auto';
    }
}
```

### Phase 2: Update Builders One at a Time

1. VpcBuilder first (most complex)
2. AuroraBuilder
3. KmsBuilder
4. Others

### Phase 3: Deprecate Old Schema

Add warnings for deprecated config, eventually remove.

## Benefits

1. **Clear Separation of Concerns**
   - Discovery = facts about what exists
   - Resolution = decisions about lifecycle
   - Building = implementation

2. **Predictable Behavior**
   - Every resource has clear lifecycle state
   - Easy to reason about: "Will this be in the template or not?"

3. **Handles All Cases**
   - Resources in our stack → MANAGED (must stay in template)
   - Resources in other stacks → EXTERNAL (reference by ID)
   - Resources we create → CREATE_NEW (add to template)

4. **Self-Heal is Just Config**
   - Doesn't affect resource lifecycle
   - Auto-configures NAT, routes, etc.
   - Still respects lifecycle decisions

## Example Scenarios

### Scenario 1: Fresh Deploy
```yaml
vpc:
  enable: true
  lifecycle:
    vpc: auto           # No VPC exists → CREATE_NEW
    securityGroup: auto # No SG exists → CREATE_NEW
```

**Result:** All resources added to template, CloudFormation creates them.

### Scenario 2: Redeploy Existing Stack
```yaml
vpc:
  enable: true
  lifecycle:
    vpc: auto           # VPC in stack → MANAGED
    securityGroup: auto # SG in stack → MANAGED
```

**Result:** All resources added to template (same as before), CloudFormation sees no changes.

### Scenario 3: Use Shared VPC
```yaml
vpc:
  enable: true
  lifecycle:
    vpc: external       # Explicit external
    securityGroup: auto # No SG → CREATE_NEW
  external:
    vpcId: vpc-shared-prod
```

**Result:**
- VPC: Referenced by ID (not in template)
- SecurityGroup: Added to template, uses external VPC ID in Properties

### Scenario 4: Mixed Management
```yaml
vpc:
  enable: true
  lifecycle:
    vpc: external           # Use shared VPC
    securityGroup: external # Use shared SG
    subnets: managed        # But manage our own subnets
  external:
    vpcId: vpc-shared
    securityGroupIds: [sg-shared]
```

**Result:**
- VPC: Referenced by ID
- SecurityGroup: Referenced by ID
- Subnets: Added to template (in shared VPC)

## Implementation Checklist

- [ ] Define TypeScript interfaces for new schema
- [ ] Implement ResourceResolver base class
- [ ] Update discovery to return structured DiscoveryResult
- [ ] Implement VpcResourceResolver
- [ ] Update VpcBuilder to use resolver
- [ ] Add migration layer for legacy config
- [ ] Update tests for VpcBuilder
- [ ] Repeat for AuroraBuilder, KmsBuilder, etc.
- [ ] Add comprehensive integration tests
- [ ] Update documentation
- [ ] Deprecate old schema
