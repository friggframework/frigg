# Pre-Deployment Health Check Specification

## Overview

This specification defines a **pre-deployment health check system** that prevents deployment failures by detecting blocking issues before invoking `serverless deploy`. The system integrates with the existing `frigg doctor` and `frigg repair` infrastructure health check domain, following **Test-Driven Development (TDD)**, **Domain-Driven Design (DDD)**, and **Hexagonal Architecture** patterns.

**Problem Statement:**
Deployments frequently fail due to **orphaned resources** (KMS aliases, VPCs, security groups) that cause CloudFormation `AlreadyExistsException` errors. These failures waste time, create broken stacks in `ROLLBACK_COMPLETE` or `UPDATE_ROLLBACK_COMPLETE` states, and require manual remediation.

**Solution:**
Run a comprehensive pre-deployment health check that:
1. **Blocks deployment** for issues that will cause CloudFormation to fail
2. **Shows warnings** for non-blocking issues (drift, property mismatches)
3. **Suggests remediation** via `frigg repair` commands
4. **Provides clear exit paths** for users (fix and retry vs. skip warnings)

---

## Architecture

### Hexagonal Architecture (Ports & Adapters)

Following the existing `packages/devtools/infrastructure/domains/health/` architecture:

```
┌──────────────────────────────────────────────────────────────┐
│                     CLI LAYER                                │
│   frigg deploy --stage prod                                  │
│     ↓ (before serverless deploy)                            │
│   RunPreDeploymentHealthCheck                               │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│           APPLICATION LAYER (Use Cases)                      │
│                                                              │
│  • RunPreDeploymentHealthCheckUseCase (NEW)                │
│    - Orchestrates pre-deployment checks                     │
│    - Categorizes issues as BLOCKING vs WARNING              │
│    - Returns actionable recommendations                     │
│                                                              │
│  • RunHealthCheckUseCase (EXISTING - Post-Deploy)          │
│    - Comprehensive drift/orphan detection                   │
│    - Used by both doctor and deploy commands                │
└────────────────────────┬─────────────────────────────────────┘
                         │ Uses Ports (Interfaces)
                         │
┌────────────────────────▼─────────────────────────────────────┐
│                 PORT INTERFACES (Boundaries)                 │
│                                                              │
│  • IStackRepository     - Stack CRUD, drift detection       │
│  • IResourceDetector    - Orphan detection                  │
│  • IMismatchAnalyzer    - Property drift analysis           │
│  • IHealthScoreCalculator - Health scoring                  │
└────────────────────────┬─────────────────────────────────────┘
                         │ Implemented by
                         │
┌────────────────────────▼─────────────────────────────────────┐
│            ADAPTER LAYER (AWS-Specific)                      │
│                                                              │
│  • AWSStackRepository          - CloudFormation SDK          │
│  • AWSResourceDetector         - AWS SDK (KMS, VPC, etc.)   │
│  • MismatchAnalyzer (Domain)   - Property comparison        │
│  • HealthScoreCalculator       - Scoring algorithm           │
└──────────────────────────────────────────────────────────────┘
```

### Domain Model

Reuses existing domain entities from `domains/health/domain/entities/`:

- **`Issue`** - Represents detected problems (ORPHANED_RESOURCE, MISSING_RESOURCE, PROPERTY_MISMATCH)
- **`Resource`** - CloudFormation resource with state (IN_STACK, ORPHANED, MISSING, DRIFTED)
- **`HealthScore`** - Score 0-100 with status (HEALTHY, DEGRADED, CRITICAL)
- **`StackIdentifier`** - Stack name + region
- **`PropertyMismatch`** - Property drift details with mutability info

**New Value Object:**

- **`BlockingCategory`** - Classification of issue severity for pre-deployment

---

## Blocking vs. Warning Categories

### BLOCKING Issues (Prevent Deployment)

These issues will cause CloudFormation to fail with errors like `AlreadyExistsException`, `LimitExceededException`, or invalid stack states.

#### 1. Stack in Invalid State

**CloudFormation Behavior:**
- Cannot update stacks in certain states
- Attempting to update will immediately fail with `ValidationError`

**Blocking Stack States:**
```javascript
const BLOCKING_STACK_STATES = [
    'CREATE_FAILED',           // Stack failed to create - must delete first
    'ROLLBACK_COMPLETE',       // Orphaned from failed create - must delete first
    'ROLLBACK_FAILED',         // Rollback itself failed - needs manual intervention
    'UPDATE_ROLLBACK_FAILED',  // Update rollback failed - needs ContinueUpdateRollback
    'DELETE_IN_PROGRESS',      // Stack being deleted - wait or cancel
    'DELETE_FAILED',           // Delete failed - manual cleanup needed
];
```

**Non-Blocking States (OK to deploy):**
```javascript
const DEPLOYABLE_STACK_STATES = [
    'CREATE_COMPLETE',
    'UPDATE_COMPLETE',
    'UPDATE_ROLLBACK_COMPLETE', // Can update after rollback cleanup completes
    'IMPORT_COMPLETE',
    'IMPORT_ROLLBACK_COMPLETE',
];
```

**Issue Example:**
```javascript
Issue.stackInInvalidState({
    resourceType: 'AWS::CloudFormation::Stack',
    resourceId: 'my-app-prod',
    stackStatus: 'ROLLBACK_COMPLETE',
    description: 'Stack is in ROLLBACK_COMPLETE state and cannot be updated. Must be deleted first.',
    resolution: 'Delete stack with: aws cloudformation delete-stack --stack-name my-app-prod',
    canAutoFix: false,
});
```

#### 2. Orphaned Resources (AlreadyExistsException)

**CloudFormation Behavior:**
- Resource exists in AWS but not tracked by stack
- CloudFormation attempts to create → gets `AlreadyExistsException`
- Deployment fails immediately

**Detection Strategy:**
```javascript
// Check if resource exists in AWS AND not in current stack resources
const orphanedResources = await resourceDetector.findOrphanedResources({
    stackIdentifier,
    expectedResources: templateParser.getExpectedResourcesFromTemplate(),
});
```

**Blocking Resource Types:**
```javascript
const BLOCKING_ORPHAN_TYPES = [
    'AWS::KMS::Alias',         // Our recurring issue
    'AWS::KMS::Key',           // With Retain policy
    'AWS::EC2::VPC',           // Named resources
    'AWS::S3::Bucket',         // Named buckets
    'AWS::Lambda::Function',   // Named functions
    'AWS::RDS::DBInstance',    // Named databases
    'AWS::DynamoDB::Table',    // Named tables
    // Any resource with explicit name will block
];
```

**Issue Example:**
```javascript
Issue.orphanedResource({
    resourceType: 'AWS::KMS::Alias',
    resourceId: 'alias/quo-integrations-dev-frigg-kms',
    description: 'KMS alias exists in AWS but not tracked by CloudFormation stack. Deployment will fail with AlreadyExistsException.',
    resolution: 'Import resource: frigg repair --import AWS::KMS::Alias alias/quo-integrations-dev-frigg-kms',
    canAutoFix: true, // Can use CloudFormation import
});
```

#### 3. Resource Quota Exceeded

**CloudFormation Behavior:**
- Attempts to create resource → hits AWS service quota
- Fails with `LimitExceededException` or service-specific error

**Detection Strategy:**
```javascript
// Check current usage vs. quota for resources in template
const quotaChecks = await resourceDetector.checkServiceQuotas({
    stackIdentifier,
    templateResources: templateParser.getResourceCounts(),
});
```

**Blocking Quota Issues:**
```javascript
const QUOTA_CHECKS = [
    { resource: 'AWS::EC2::EIP', service: 'ec2', quota: 'L-0263D0A3' }, // 5 EIPs per region
    { resource: 'AWS::EC2::VPC', service: 'ec2', quota: 'L-F678F1CE' }, // 5 VPCs per region
    { resource: 'AWS::Lambda::Function', service: 'lambda', quota: 'L-9FEE3D26' }, // 1000 functions
    { resource: 'AWS::S3::Bucket', service: 's3', quota: 'L-DC2B2D3D' }, // 100 buckets per account
];
```

**Issue Example:**
```javascript
Issue.quotaExceeded({
    resourceType: 'AWS::EC2::EIP',
    resourceId: 'FriggNATGatewayEIP',
    quotaCode: 'L-0263D0A3',
    currentUsage: 5,
    quota: 5,
    description: 'Account has 5 Elastic IPs allocated (limit: 5). Cannot create FriggNATGatewayEIP.',
    resolution: 'Release unused EIPs or request quota increase: https://console.aws.amazon.com/servicequotas/',
    canAutoFix: false,
});
```

#### 4. Missing Required Resources (Dependencies)

**CloudFormation Behavior:**
- Template references resource that doesn't exist (e.g., VPC ID, Security Group)
- Deployment fails with `InvalidParameterValue` or similar

**Detection Strategy:**
```javascript
// Verify all referenced resources exist
const missingDependencies = await resourceDetector.checkDependencies({
    templateReferences: templateParser.getResourceReferences(),
});
```

**Issue Example:**
```javascript
Issue.missingDependency({
    resourceType: 'AWS::EC2::VPC',
    resourceId: 'vpc-nonexistent',
    referencedBy: 'FriggSecurityGroup',
    description: 'Template references VPC vpc-nonexistent which does not exist in AWS.',
    resolution: 'Update template to use correct VPC ID or create VPC first',
    canAutoFix: false,
});
```

---

### WARNING Issues (Non-Blocking)

These issues indicate drift or suboptimal configuration but won't prevent deployment.

#### 1. Property Drift (Mutable Properties)

**CloudFormation Behavior:**
- Resource exists but properties differ from template
- Deployment succeeds but may update resources
- **Mutable properties** can be updated without replacement

**Issue Example:**
```javascript
Issue.propertyMismatch({
    resourceType: 'AWS::Lambda::Function',
    resourceId: 'my-function',
    mismatch: new PropertyMismatch({
        propertyPath: 'Timeout',
        expectedValue: 30,
        actualValue: 60,
        mutability: PropertyMutability.MUTABLE,
        requiresReplacement: false,
    }),
});
```

#### 2. Health Score < 80 (Degraded)

**Issue Example:**
```javascript
Issue.degradedHealth({
    resourceType: 'AWS::CloudFormation::Stack',
    resourceId: 'my-app-prod',
    healthScore: 65,
    description: 'Stack health score is 65 (DEGRADED). 3 resources have property drift.',
    resolution: 'Review drift with: frigg doctor my-app-prod --verbose',
    canAutoFix: false,
});
```

#### 3. Missing Optional Tags

**Issue Example:**
```javascript
Issue.missingTag({
    resourceType: 'AWS::KMS::Key',
    resourceId: 'key-12345',
    missingTags: ['Environment', 'Owner'],
    description: 'KMS key missing recommended tags: Environment, Owner',
    resolution: 'Add tags via: frigg repair --reconcile',
    canAutoFix: true,
});
```

---

## CloudFormation Stack Status Reference

Complete list of all 23 possible CloudFormation stack statuses:

### CREATE Operations
- `CREATE_IN_PROGRESS` - Stack creation in progress (⏳ wait)
- `CREATE_FAILED` - Stack creation failed (🚫 BLOCKING - must delete)
- `CREATE_COMPLETE` - Stack created successfully (✅ deployable)

### ROLLBACK Operations
- `ROLLBACK_IN_PROGRESS` - Rolling back failed create (⏳ wait)
- `ROLLBACK_FAILED` - Rollback failed (🚫 BLOCKING - manual intervention)
- `ROLLBACK_COMPLETE` - Rollback completed (🚫 BLOCKING - orphaned stack, must delete)

### DELETE Operations
- `DELETE_IN_PROGRESS` - Stack deletion in progress (⏳ wait)
- `DELETE_FAILED` - Stack deletion failed (🚫 BLOCKING - manual cleanup)
- `DELETE_COMPLETE` - Stack deleted (✅ no stack, proceed with create)

### UPDATE Operations
- `UPDATE_IN_PROGRESS` - Stack update in progress (⏳ wait)
- `UPDATE_COMPLETE_CLEANUP_IN_PROGRESS` - Cleaning up old resources (⏳ wait)
- `UPDATE_COMPLETE` - Stack updated successfully (✅ deployable)
- `UPDATE_FAILED` - Stack update failed (⚠️ WARNING - will attempt rollback)

### UPDATE_ROLLBACK Operations
- `UPDATE_ROLLBACK_IN_PROGRESS` - Rolling back failed update (⏳ wait)
- `UPDATE_ROLLBACK_FAILED` - Update rollback failed (🚫 BLOCKING - needs ContinueUpdateRollback)
- `UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS` - Cleaning up after rollback (⏳ wait)
- `UPDATE_ROLLBACK_COMPLETE` - Update rolled back (✅ deployable after cleanup)

### IMPORT Operations
- `IMPORT_IN_PROGRESS` - Resource import in progress (⏳ wait)
- `IMPORT_COMPLETE` - Resources imported successfully (✅ deployable)
- `IMPORT_ROLLBACK_IN_PROGRESS` - Rolling back failed import (⏳ wait)
- `IMPORT_ROLLBACK_FAILED` - Import rollback failed (🚫 BLOCKING)
- `IMPORT_ROLLBACK_COMPLETE` - Import rolled back (✅ deployable)

### REVIEW Operations
- `REVIEW_IN_PROGRESS` - Change set review (⏳ not a real stack yet)

---

## Implementation Plan (TDD Approach)

### Phase 1: Domain Layer (Test-First)

**File:** `domains/health/domain/value-objects/blocking-category.js`

```javascript
/**
 * BlockingCategory Value Object
 *
 * Categorizes issues for pre-deployment health checks
 */
class BlockingCategory {
    static CATEGORIES = {
        BLOCKING: 'BLOCKING',      // Prevents deployment
        WARNING: 'WARNING',        // Non-blocking
        INFO: 'INFO',              // Informational
    };

    static BLOCKING_REASONS = {
        INVALID_STACK_STATE: 'INVALID_STACK_STATE',
        ORPHANED_RESOURCE: 'ORPHANED_RESOURCE',
        QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
        MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
    };

    constructor({ category, reason, description }) {
        this.category = category;
        this.reason = reason;
        this.description = description;
    }

    isBlocking() {
        return this.category === BlockingCategory.CATEGORIES.BLOCKING;
    }

    isWarning() {
        return this.category === BlockingCategory.CATEGORIES.WARNING;
    }
}
```

**Tests:** `__tests__/blocking-category.test.js`

```javascript
describe('BlockingCategory', () => {
    it('should create blocking category for invalid stack state', () => {
        const category = new BlockingCategory({
            category: BlockingCategory.CATEGORIES.BLOCKING,
            reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
            description: 'Stack in ROLLBACK_COMPLETE',
        });

        expect(category.isBlocking()).toBe(true);
        expect(category.isWarning()).toBe(false);
    });

    it('should create warning category for property drift', () => {
        const category = new BlockingCategory({
            category: BlockingCategory.CATEGORIES.WARNING,
            reason: 'PROPERTY_DRIFT',
            description: 'Mutable property drift detected',
        });

        expect(category.isBlocking()).toBe(false);
        expect(category.isWarning()).toBe(true);
    });
});
```

### Phase 2: Domain Service (Test-First)

**File:** `domains/health/domain/services/pre-deployment-categorizer.js`

```javascript
/**
 * PreDeploymentCategorizer Domain Service
 *
 * Categorizes issues for pre-deployment health checks
 */
class PreDeploymentCategorizer {
    static BLOCKING_STACK_STATES = [
        'CREATE_FAILED',
        'ROLLBACK_COMPLETE',
        'ROLLBACK_FAILED',
        'UPDATE_ROLLBACK_FAILED',
        'DELETE_IN_PROGRESS',
        'DELETE_FAILED',
    ];

    static BLOCKING_ORPHAN_TYPES = [
        'AWS::KMS::Alias',
        'AWS::KMS::Key',
        'AWS::EC2::VPC',
        'AWS::S3::Bucket',
        'AWS::Lambda::Function',
        'AWS::RDS::DBInstance',
        'AWS::DynamoDB::Table',
    ];

    /**
     * Categorize issue for pre-deployment
     */
    categorize(issue) {
        // Stack in invalid state - BLOCKING
        if (this._isInvalidStackState(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                description: `Stack state ${issue.stackStatus} prevents deployment`,
            });
        }

        // Orphaned resource that will cause AlreadyExistsException - BLOCKING
        if (this._isBlockingOrphan(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE,
                description: `Orphaned ${issue.resourceType} will cause AlreadyExistsException`,
            });
        }

        // Resource quota exceeded - BLOCKING
        if (this._isQuotaExceeded(issue)) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.BLOCKING,
                reason: BlockingCategory.BLOCKING_REASONS.QUOTA_EXCEEDED,
                description: `${issue.resourceType} quota exceeded`,
            });
        }

        // Property drift (mutable) - WARNING
        if (issue.isPropertyMismatch() && !issue.propertyMismatch.requiresReplacement()) {
            return new BlockingCategory({
                category: BlockingCategory.CATEGORIES.WARNING,
                reason: 'PROPERTY_DRIFT',
                description: 'Mutable property drift detected',
            });
        }

        // Default to INFO
        return new BlockingCategory({
            category: BlockingCategory.CATEGORIES.INFO,
            reason: 'OTHER',
            description: issue.description,
        });
    }

    _isInvalidStackState(issue) {
        return issue.stackStatus &&
               PreDeploymentCategorizer.BLOCKING_STACK_STATES.includes(issue.stackStatus);
    }

    _isBlockingOrphan(issue) {
        return issue.isOrphanedResource() &&
               PreDeploymentCategorizer.BLOCKING_ORPHAN_TYPES.includes(issue.resourceType);
    }

    _isQuotaExceeded(issue) {
        return issue.type === Issue.TYPES.QUOTA_EXCEEDED;
    }
}
```

**Tests:** `__tests__/pre-deployment-categorizer.test.js` (100% coverage)

```javascript
describe('PreDeploymentCategorizer', () => {
    let categorizer;

    beforeEach(() => {
        categorizer = new PreDeploymentCategorizer();
    });

    describe('categorize', () => {
        it('should categorize invalid stack state as BLOCKING', () => {
            const issue = {
                type: Issue.TYPES.INVALID_STACK_STATE,
                stackStatus: 'ROLLBACK_COMPLETE',
                description: 'Stack in rollback complete',
            };

            const category = categorizer.categorize(issue);

            expect(category.isBlocking()).toBe(true);
            expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE);
        });

        it('should categorize orphaned KMS alias as BLOCKING', () => {
            const issue = Issue.orphanedResource({
                resourceType: 'AWS::KMS::Alias',
                resourceId: 'alias/my-app-dev-kms',
                description: 'Orphaned KMS alias',
            });

            const category = categorizer.categorize(issue);

            expect(category.isBlocking()).toBe(true);
            expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE);
        });

        it('should categorize property drift as WARNING', () => {
            const mismatch = new PropertyMismatch({
                propertyPath: 'Timeout',
                expectedValue: 30,
                actualValue: 60,
                mutability: PropertyMutability.MUTABLE,
            });

            const issue = Issue.propertyMismatch({
                resourceType: 'AWS::Lambda::Function',
                resourceId: 'my-function',
                mismatch,
            });

            const category = categorizer.categorize(issue);

            expect(category.isWarning()).toBe(true);
            expect(category.reason).toBe('PROPERTY_DRIFT');
        });

        it('should categorize quota exceeded as BLOCKING', () => {
            const issue = {
                type: Issue.TYPES.QUOTA_EXCEEDED,
                resourceType: 'AWS::EC2::EIP',
                description: 'EIP quota exceeded',
            };

            const category = categorizer.categorize(issue);

            expect(category.isBlocking()).toBe(true);
            expect(category.reason).toBe(BlockingCategory.BLOCKING_REASONS.QUOTA_EXCEEDED);
        });
    });
});
```

### Phase 3: Use Case (Test-First)

**File:** `domains/health/application/use-cases/run-pre-deployment-health-check-use-case.js`

```javascript
/**
 * RunPreDeploymentHealthCheckUseCase
 *
 * Application Layer - Use Case
 *
 * Orchestrates pre-deployment health checks to prevent deployment failures
 */
class RunPreDeploymentHealthCheckUseCase {
    constructor({
        stackRepository,
        resourceDetector,
        mismatchAnalyzer,
        healthScoreCalculator,
        preDeploymentCategorizer,
    }) {
        this.stackRepository = stackRepository;
        this.resourceDetector = resourceDetector;
        this.mismatchAnalyzer = mismatchAnalyzer;
        this.healthScoreCalculator = healthScoreCalculator;
        this.categorizer = preDeploymentCategorizer;
    }

    /**
     * Execute pre-deployment health check
     *
     * @param {Object} params
     * @param {StackIdentifier} params.stackIdentifier - Stack to check
     * @param {string} params.templatePath - Path to generated serverless.yml
     * @param {Function} params.onProgress - Progress callback
     * @returns {Promise<PreDeploymentHealthReport>}
     */
    async execute({ stackIdentifier, templatePath, onProgress }) {
        const progress = (step, message) => onProgress?.(step, message);

        // 1. Check if stack exists
        progress('📋 Step 1/6:', 'Checking stack status...');
        let stackExists = true;
        let stack = null;

        try {
            stack = await this.stackRepository.getStack(stackIdentifier);
        } catch (error) {
            if (error.code === 'ValidationError') {
                stackExists = false;
                progress('   Stack does not exist (first deployment)');
            } else {
                throw error;
            }
        }

        const issues = [];

        // 2. If stack exists, check if it's in deployable state
        if (stackExists) {
            progress('🔍 Step 2/6:', 'Validating stack state...');

            if (!this._isDeployableState(stack.stackStatus)) {
                issues.push({
                    type: Issue.TYPES.INVALID_STACK_STATE,
                    severity: Issue.SEVERITIES.CRITICAL,
                    resourceType: 'AWS::CloudFormation::Stack',
                    resourceId: stackIdentifier.stackName,
                    stackStatus: stack.stackStatus,
                    description: `Stack is in ${stack.stackStatus} state and cannot be updated`,
                    resolution: this._getStackStateResolution(stack.stackStatus),
                    canAutoFix: false,
                });
            }
        } else {
            progress('⏭️  Step 2/6:', 'Skipping state validation (new stack)');
        }

        // 3. Parse expected resources from template
        progress('📄 Step 3/6:', 'Parsing deployment template...');
        const templateParser = new TemplateParser();
        const expectedResources = await templateParser.parseTemplate(templatePath);

        // 4. Check for orphaned resources
        progress('🔎 Step 4/6:', 'Checking for orphaned resources...');
        const orphanedResources = await this.resourceDetector.findOrphanedResources({
            stackIdentifier,
            expectedResources,
        });

        orphanedResources.forEach(orphan => {
            issues.push(Issue.orphanedResource({
                resourceType: orphan.resourceType,
                resourceId: orphan.physicalId,
                description: `Resource exists in AWS but not tracked by stack: ${orphan.physicalId}`,
            }));
        });

        // 5. Check resource quotas
        progress('📊 Step 5/6:', 'Checking service quotas...');
        const quotaIssues = await this.resourceDetector.checkServiceQuotas({
            stackIdentifier,
            expectedResources,
        });

        issues.push(...quotaIssues);

        // 6. Categorize all issues
        progress('🏷️  Step 6/6:', 'Categorizing issues...');
        const categorizedIssues = issues.map(issue => ({
            issue,
            category: this.categorizer.categorize(issue),
        }));

        // Separate blocking and warning issues
        const blockingIssues = categorizedIssues.filter(i => i.category.isBlocking());
        const warningIssues = categorizedIssues.filter(i => i.category.isWarning());

        return {
            canDeploy: blockingIssues.length === 0,
            blockingIssues,
            warningIssues,
            stackExists,
            stackStatus: stack?.stackStatus,
            summary: {
                total: issues.length,
                blocking: blockingIssues.length,
                warnings: warningIssues.length,
            },
        };
    }

    _isDeployableState(stackStatus) {
        const DEPLOYABLE_STATES = [
            'CREATE_COMPLETE',
            'UPDATE_COMPLETE',
            'UPDATE_ROLLBACK_COMPLETE',
            'IMPORT_COMPLETE',
            'IMPORT_ROLLBACK_COMPLETE',
        ];

        return DEPLOYABLE_STATES.includes(stackStatus);
    }

    _getStackStateResolution(stackStatus) {
        const resolutions = {
            'ROLLBACK_COMPLETE': 'Delete stack with: aws cloudformation delete-stack --stack-name ${stackName}',
            'CREATE_FAILED': 'Delete stack with: aws cloudformation delete-stack --stack-name ${stackName}',
            'UPDATE_ROLLBACK_FAILED': 'Continue rollback with: aws cloudformation continue-update-rollback --stack-name ${stackName}',
            'DELETE_FAILED': 'Force delete with: aws cloudformation delete-stack --stack-name ${stackName} --force',
            'DELETE_IN_PROGRESS': 'Wait for deletion to complete',
        };

        return resolutions[stackStatus] || 'Manual intervention required';
    }
}
```

**Tests:** `__tests__/run-pre-deployment-health-check-use-case.test.js` (100% coverage)

```javascript
describe('RunPreDeploymentHealthCheckUseCase', () => {
    let useCase;
    let mockStackRepository;
    let mockResourceDetector;
    let mockCategorizer;

    beforeEach(() => {
        mockStackRepository = {
            getStack: jest.fn(),
        };

        mockResourceDetector = {
            findOrphanedResources: jest.fn(),
            checkServiceQuotas: jest.fn(),
        };

        mockCategorizer = {
            categorize: jest.fn(),
        };

        useCase = new RunPreDeploymentHealthCheckUseCase({
            stackRepository: mockStackRepository,
            resourceDetector: mockResourceDetector,
            preDeploymentCategorizer: mockCategorizer,
        });
    });

    describe('execute', () => {
        it('should allow deployment when no blocking issues found', async () => {
            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackStatus: 'UPDATE_COMPLETE',
            });

            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
            mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

            const result = await useCase.execute({
                stackIdentifier: new StackIdentifier({ stackName: 'my-app-prod', region: 'us-east-1' }),
                templatePath: '/path/to/infrastructure.yml',
            });

            expect(result.canDeploy).toBe(true);
            expect(result.blockingIssues).toHaveLength(0);
        });

        it('should block deployment when stack in ROLLBACK_COMPLETE', async () => {
            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackStatus: 'ROLLBACK_COMPLETE',
            });

            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
            mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

            mockCategorizer.categorize.mockReturnValue(
                new BlockingCategory({
                    category: BlockingCategory.CATEGORIES.BLOCKING,
                    reason: BlockingCategory.BLOCKING_REASONS.INVALID_STACK_STATE,
                    description: 'Stack in ROLLBACK_COMPLETE',
                })
            );

            const result = await useCase.execute({
                stackIdentifier: new StackIdentifier({ stackName: 'my-app-prod', region: 'us-east-1' }),
                templatePath: '/path/to/infrastructure.yml',
            });

            expect(result.canDeploy).toBe(false);
            expect(result.blockingIssues).toHaveLength(1);
            expect(result.blockingIssues[0].issue.stackStatus).toBe('ROLLBACK_COMPLETE');
        });

        it('should block deployment when orphaned KMS alias found', async () => {
            mockStackRepository.getStack.mockResolvedValue({
                stackName: 'my-app-prod',
                stackStatus: 'UPDATE_COMPLETE',
            });

            mockResourceDetector.findOrphanedResources.mockResolvedValue([
                {
                    resourceType: 'AWS::KMS::Alias',
                    physicalId: 'alias/my-app-prod-kms',
                },
            ]);

            mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

            mockCategorizer.categorize.mockReturnValue(
                new BlockingCategory({
                    category: BlockingCategory.CATEGORIES.BLOCKING,
                    reason: BlockingCategory.BLOCKING_REASONS.ORPHANED_RESOURCE,
                    description: 'Orphaned KMS alias',
                })
            );

            const result = await useCase.execute({
                stackIdentifier: new StackIdentifier({ stackName: 'my-app-prod', region: 'us-east-1' }),
                templatePath: '/path/to/infrastructure.yml',
            });

            expect(result.canDeploy).toBe(false);
            expect(result.blockingIssues).toHaveLength(1);
            expect(result.blockingIssues[0].issue.resourceType).toBe('AWS::KMS::Alias');
        });

        it('should allow deployment for first-time stack creation', async () => {
            mockStackRepository.getStack.mockRejectedValue({
                code: 'ValidationError',
                message: 'Stack does not exist',
            });

            mockResourceDetector.findOrphanedResources.mockResolvedValue([]);
            mockResourceDetector.checkServiceQuotas.mockResolvedValue([]);

            const result = await useCase.execute({
                stackIdentifier: new StackIdentifier({ stackName: 'my-app-prod', region: 'us-east-1' }),
                templatePath: '/path/to/infrastructure.yml',
            });

            expect(result.canDeploy).toBe(true);
            expect(result.stackExists).toBe(false);
        });
    });
});
```

### Phase 4: CLI Integration

**File:** `packages/frigg-cli/deploy-command/index.js` (UPDATE EXISTING)

```javascript
/**
 * Pre-deployment health check integration
 * Runs before serverless deploy to catch blocking issues
 */
async function runPreDeploymentHealthCheck(stackName, options) {
    console.log('\n' + '═'.repeat(80));
    console.log('Running pre-deployment health check...');
    console.log('═'.repeat(80));

    try {
        const { RunPreDeploymentHealthCheckUseCase } = require('@friggframework/devtools/infrastructure/domains/health/application/use-cases/run-pre-deployment-health-check-use-case');
        const { AWSStackRepository } = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/aws-stack-repository');
        const { AWSResourceDetector } = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/aws-resource-detector');
        const { PreDeploymentCategorizer } = require('@friggframework/devtools/infrastructure/domains/health/domain/services/pre-deployment-categorizer');
        const StackIdentifier = require('@friggframework/devtools/infrastructure/domains/health/domain/value-objects/stack-identifier');

        const stackRepository = new AWSStackRepository({ region: options.region });
        const resourceDetector = new AWSResourceDetector({ region: options.region });
        const categorizer = new PreDeploymentCategorizer();

        const useCase = new RunPreDeploymentHealthCheckUseCase({
            stackRepository,
            resourceDetector,
            preDeploymentCategorizer: categorizer,
        });

        const result = await useCase.execute({
            stackIdentifier: new StackIdentifier({
                stackName,
                region: options.region || 'us-east-1',
            }),
            templatePath: path.join(process.cwd(), PATHS.INFRASTRUCTURE),
            onProgress: (step, message) => console.log(step, message),
        });

        // Display results
        console.log('\n📊 Pre-Deployment Health Check Results:');
        console.log(`   Total issues: ${result.summary.total}`);
        console.log(`   🚫 Blocking: ${result.summary.blocking}`);
        console.log(`   ⚠️  Warnings: ${result.summary.warnings}`);

        // Show blocking issues
        if (result.blockingIssues.length > 0) {
            console.log('\n🚫 BLOCKING ISSUES (deployment will fail):');
            result.blockingIssues.forEach((item, index) => {
                console.log(`\n   ${index + 1}. ${item.issue.description}`);
                console.log(`      Type: ${item.issue.resourceType}`);
                console.log(`      Resolution: ${item.issue.resolution}`);
                if (item.issue.canAutoFix) {
                    console.log(`      ✓ Can be auto-fixed with: frigg repair --import`);
                }
            });

            console.log('\n✗ Deployment blocked due to critical issues');
            console.log('  Fix these issues and run deploy again');
            return false; // Block deployment
        }

        // Show warnings
        if (result.warningIssues.length > 0) {
            console.log('\n⚠️  WARNINGS (non-blocking):');
            result.warningIssues.forEach((item, index) => {
                console.log(`\n   ${index + 1}. ${item.issue.description}`);
                console.log(`      Type: ${item.issue.resourceType}`);
            });

            console.log('\n⚠️  Warnings detected but deployment can proceed');
            console.log('   Run "frigg doctor" after deployment to address warnings');
        } else {
            console.log('\n✓ No issues detected - deployment can proceed');
        }

        return true; // Allow deployment

    } catch (error) {
        console.log(`\n⚠️  Pre-deployment health check failed: ${error.message}`);
        if (options.verbose) {
            console.error(error.stack);
        }

        // On error, allow deployment (fail open)
        console.log('   Proceeding with deployment...');
        return true;
    }
}

async function deployCommand(options) {
    console.log('Deploying the serverless application...');

    const appDefinition = loadAppDefinition();
    const stackName = getStackName(appDefinition, options);

    // NEW: Run pre-deployment health check (unless --skip-pre-check)
    if (!options.skipPreCheck && stackName) {
        const canDeploy = await runPreDeploymentHealthCheck(stackName, options);

        if (!canDeploy) {
            console.error('\n✗ Deployment aborted due to blocking issues');
            process.exit(1);
        }
    }

    const environment = validateAndBuildEnvironment(appDefinition, options);

    // Execute deployment
    const exitCode = await executeServerlessDeployment(environment, options);

    // ... rest of deploy command (post-deployment health check)
}
```

---

## CLI User Experience

### Scenario 1: Orphaned KMS Alias (BLOCKING)

```bash
$ frigg deploy --stage dev

Deploying the serverless application...

═══════════════════════════════════════════════════════════════════════════════
Running pre-deployment health check...
═══════════════════════════════════════════════════════════════════════════════
📋 Step 1/6: Checking stack status...
   Stack exists: quo-integrations-dev (UPDATE_COMPLETE)
🔍 Step 2/6: Validating stack state...
   ✓ Stack is in deployable state
📄 Step 3/6: Parsing deployment template...
   Found 47 resources in template
🔎 Step 4/6: Checking for orphaned resources...
   ⚠️  Found 1 orphaned resource
📊 Step 5/6: Checking service quotas...
   ✓ All quotas within limits
🏷️  Step 6/6: Categorizing issues...

📊 Pre-Deployment Health Check Results:
   Total issues: 1
   🚫 Blocking: 1
   ⚠️  Warnings: 0

🚫 BLOCKING ISSUES (deployment will fail):

   1. KMS alias exists in AWS but not tracked by CloudFormation stack. Deployment will fail with AlreadyExistsException.
      Type: AWS::KMS::Alias
      Resource: alias/quo-integrations-dev-frigg-kms
      Resolution: Import resource with: frigg repair --import AWS::KMS::Alias alias/quo-integrations-dev-frigg-kms
      ✓ Can be auto-fixed with: frigg repair --import

✗ Deployment blocked due to critical issues
  Fix these issues and run deploy again

$ frigg repair --import AWS::KMS::Alias alias/quo-integrations-dev-frigg-kms
✓ Resource imported successfully

$ frigg deploy --stage dev
✓ Pre-deployment health check passed
🚀 Deploying serverless application...
✓ Deployment completed successfully!
```

### Scenario 2: Stack in ROLLBACK_COMPLETE (BLOCKING)

```bash
$ frigg deploy --stage dev

Deploying the serverless application...

═══════════════════════════════════════════════════════════════════════════════
Running pre-deployment health check...
═══════════════════════════════════════════════════════════════════════════════
📋 Step 1/6: Checking stack status...
   Stack exists: my-app-dev (ROLLBACK_COMPLETE)
🔍 Step 2/6: Validating stack state...
   ✗ Stack in invalid state

📊 Pre-Deployment Health Check Results:
   Total issues: 1
   🚫 Blocking: 1
   ⚠️  Warnings: 0

🚫 BLOCKING ISSUES (deployment will fail):

   1. Stack is in ROLLBACK_COMPLETE state and cannot be updated. This is an orphaned stack from a failed creation.
      Type: AWS::CloudFormation::Stack
      Resource: my-app-dev
      Resolution: Delete stack with: aws cloudformation delete-stack --stack-name my-app-dev

✗ Deployment blocked due to critical issues
  Fix these issues and run deploy again
```

### Scenario 3: Property Drift (WARNING)

```bash
$ frigg deploy --stage prod

═══════════════════════════════════════════════════════════════════════════════
Running pre-deployment health check...
═══════════════════════════════════════════════════════════════════════════════
📋 Step 1/6: Checking stack status...
🔍 Step 2/6: Validating stack state...
📄 Step 3/6: Parsing deployment template...
🔎 Step 4/6: Checking for orphaned resources...
📊 Step 5/6: Checking service quotas...
🏷️  Step 6/6: Categorizing issues...

📊 Pre-Deployment Health Check Results:
   Total issues: 3
   🚫 Blocking: 0
   ⚠️  Warnings: 3

⚠️  WARNINGS (non-blocking):

   1. Property mismatch: Timeout (expected: 30, actual: 60)
      Type: AWS::Lambda::Function
      Resource: ProcessOrderFunction

   2. Property mismatch: MemorySize (expected: 1024, actual: 512)
      Type: AWS::Lambda::Function
      Resource: SyncDataFunction

   3. Missing recommended tags: Environment, Owner
      Type: AWS::KMS::Key

⚠️  Warnings detected but deployment can proceed
   Run "frigg doctor" after deployment to address warnings

✓ Pre-deployment health check passed
🚀 Deploying serverless application...
✓ Deployment completed successfully!
```

---

## Testing Strategy

### Unit Tests (100% Coverage)

**Domain Layer:**
- `BlockingCategory` value object
- `PreDeploymentCategorizer` domain service

**Application Layer:**
- `RunPreDeploymentHealthCheckUseCase`

**Test Coverage Requirements:**
- All blocking stack states tested
- All orphan resource types tested
- All quota checks tested
- All warning scenarios tested
- Error handling and edge cases

### Integration Tests

**File:** `__tests__/integration/pre-deployment-health-check.integration.test.js`

```javascript
describe('Pre-Deployment Health Check Integration', () => {
    it('should detect orphaned KMS alias in AWS', async () => {
        // Requires real AWS credentials and stack
        // Mock: createOrphanedKMSAlias()
        // Run: health check
        // Assert: blocking issue detected
        // Cleanup: deleteOrphanedKMSAlias()
    });

    it('should detect stack in ROLLBACK_COMPLETE', async () => {
        // Mock: stackInRollbackComplete()
        // Run: health check
        // Assert: blocking issue detected with correct resolution
    });
});
```

### End-to-End Tests

**File:** `__tests__/e2e/deploy-with-health-check.e2e.test.js`

```javascript
describe('Deploy with Pre-Deployment Health Check E2E', () => {
    it('should block deployment when orphaned resource found', async () => {
        // Setup: create orphaned KMS alias
        // Run: frigg deploy
        // Assert: deployment blocked
        // Run: frigg repair --import
        // Run: frigg deploy
        // Assert: deployment succeeds
    });
});
```

---

## Configuration Options

### CLI Flags

```bash
frigg deploy --stage prod                    # Run with pre-deployment check
frigg deploy --stage prod --skip-pre-check   # Skip pre-deployment check
frigg deploy --stage prod --skip-doctor      # Skip post-deployment check
frigg deploy --stage prod --skip-all-checks  # Skip both checks
frigg deploy --stage prod --verbose          # Show detailed progress
```

### Environment Variables

```bash
FRIGG_SKIP_PRE_DEPLOYMENT_CHECK=true   # Disable pre-deployment checks
FRIGG_PRE_DEPLOYMENT_CHECK_TIMEOUT=60  # Timeout in seconds (default: 30)
```

---

## Performance Considerations

### Expected Check Duration

- **Stack state check**: < 1 second (single API call)
- **Orphan detection**: 2-5 seconds (depends on resources in template)
- **Quota checks**: 1-2 seconds per resource type
- **Total**: 5-10 seconds for typical stack

### Optimization Strategies

1. **Parallel API calls** - Check quotas and orphans concurrently
2. **Template parsing cache** - Cache parsed template structure
3. **Selective checks** - Only check resource types present in template
4. **Fail fast** - Return immediately on first blocking issue found

---

## Backward Compatibility

### Existing Behavior Preserved

- Post-deployment health check (`frigg doctor`) unchanged
- `frigg repair` commands unchanged
- Existing health check domain entities/services reused

### Migration Path

1. **Phase 1**: Pre-deployment check opt-in (`--pre-check` flag)
2. **Phase 2**: Pre-deployment check default, opt-out (`--skip-pre-check`)
3. **Phase 3**: Remove opt-out after proven stable

---

## Success Criteria

### Functional Requirements

- ✅ Detects all blocking stack states before deployment
- ✅ Detects orphaned resources that cause AlreadyExistsException
- ✅ Detects resource quota issues before deployment
- ✅ Categorizes issues as BLOCKING vs WARNING correctly
- ✅ Provides actionable remediation commands
- ✅ Integrates seamlessly with existing deploy command

### Non-Functional Requirements

- ✅ 100% test coverage (TDD approach)
- ✅ < 10 second check duration for typical stack
- ✅ Follows hexagonal architecture patterns
- ✅ Reuses existing health check domain
- ✅ Clear user experience with progress indicators

### Success Metrics

- **Zero false positives** - Never block valid deployments
- **Zero missed blocking issues** - Catch all issues that would fail
- **< 5% performance overhead** - Minimal added deployment time
- **User satisfaction** - Positive feedback on error prevention

---

## Future Enhancements

### Phase 2 Enhancements

1. **Template validation** - Validate serverless.yml syntax before generation
2. **IAM permission check** - Verify deployment user has required permissions
3. **Cross-stack dependency check** - Verify referenced stacks exist
4. **Regional availability** - Check if services available in target region

### Phase 3 Enhancements

1. **Cost estimation** - Estimate deployment cost before execution
2. **Security scan** - Check for security misconfigurations
3. **Compliance validation** - Verify tags, naming conventions
4. **Change preview** - Show what will change before deployment

---

## References

### AWS Documentation

- [CloudFormation Stack States](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/describe-stacks.html) - Complete list of 23 stack statuses
- [CloudFormation Error Codes](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/troubleshooting.html) - AlreadyExistsException, LimitExceededException, etc.
- [CloudFormation Import Resources](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/resource-import.html) - Importing orphaned resources

### Internal Documentation

- [HEALTH.md](./HEALTH.md) - Existing health check system documentation
- [CLAUDE.md](../CLAUDE.md) - Frigg Framework architecture guide
- [BUILD-VS-DEPLOYED-TEMPLATE-ANALYSIS.md](./domains/health/docs/BUILD-VS-DEPLOYED-TEMPLATE-ANALYSIS.md) - Template comparison approach

### Related Code

- `domains/health/` - Existing health check domain (DDD/Hexagonal)
- `packages/frigg-cli/deploy-command/` - Deploy command implementation
- `packages/frigg-cli/doctor-command/` - Doctor command (post-deployment)
- `packages/frigg-cli/repair-command/` - Repair command (remediation)

---

## Appendix: Complete CloudFormation Status Decision Matrix

| Stack Status | Can Deploy? | Category | Action |
|-------------|-------------|----------|--------|
| `CREATE_IN_PROGRESS` | ❌ Wait | N/A | Wait for completion |
| `CREATE_FAILED` | ❌ Blocked | BLOCKING | Delete stack first |
| `CREATE_COMPLETE` | ✅ Yes | N/A | Proceed with update |
| `ROLLBACK_IN_PROGRESS` | ❌ Wait | N/A | Wait for completion |
| `ROLLBACK_FAILED` | ❌ Blocked | BLOCKING | Manual intervention |
| `ROLLBACK_COMPLETE` | ❌ Blocked | BLOCKING | Delete stack first |
| `DELETE_IN_PROGRESS` | ❌ Wait | N/A | Wait or cancel |
| `DELETE_FAILED` | ❌ Blocked | BLOCKING | Force delete |
| `DELETE_COMPLETE` | ✅ Yes | N/A | Stack gone, create new |
| `UPDATE_IN_PROGRESS` | ❌ Wait | N/A | Wait for completion |
| `UPDATE_COMPLETE_CLEANUP_IN_PROGRESS` | ❌ Wait | N/A | Wait for cleanup |
| `UPDATE_COMPLETE` | ✅ Yes | N/A | Proceed with update |
| `UPDATE_FAILED` | ⚠️ Warning | WARNING | Will rollback |
| `UPDATE_ROLLBACK_IN_PROGRESS` | ❌ Wait | N/A | Wait for rollback |
| `UPDATE_ROLLBACK_FAILED` | ❌ Blocked | BLOCKING | Continue rollback |
| `UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS` | ❌ Wait | N/A | Wait for cleanup |
| `UPDATE_ROLLBACK_COMPLETE` | ✅ Yes | N/A | Proceed after cleanup |
| `REVIEW_IN_PROGRESS` | ❌ Wait | N/A | Change set review |
| `IMPORT_IN_PROGRESS` | ❌ Wait | N/A | Wait for import |
| `IMPORT_COMPLETE` | ✅ Yes | N/A | Proceed with update |
| `IMPORT_ROLLBACK_IN_PROGRESS` | ❌ Wait | N/A | Wait for rollback |
| `IMPORT_ROLLBACK_FAILED` | ❌ Blocked | BLOCKING | Manual intervention |
| `IMPORT_ROLLBACK_COMPLETE` | ✅ Yes | N/A | Proceed with update |

---

**Document Version:** 1.0
**Last Updated:** 2025-10-28
**Status:** ✅ COMPLETE - Ready for TDD Implementation
