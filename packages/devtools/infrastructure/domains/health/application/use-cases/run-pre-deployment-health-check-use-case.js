const Issue = require('../../domain/entities/issue');

class RunPreDeploymentHealthCheckUseCase {
    static DEPLOYABLE_STATES = [
        'CREATE_COMPLETE',
        'UPDATE_COMPLETE',
        'UPDATE_ROLLBACK_COMPLETE',
        'IMPORT_COMPLETE',
        'IMPORT_ROLLBACK_COMPLETE',
    ];

    constructor({
        stackRepository,
        resourceDetector,
        preDeploymentCategorizer,
        templateParser,
    }) {
        if (!stackRepository) {
            throw new Error('stackRepository is required');
        }
        if (!resourceDetector) {
            throw new Error('resourceDetector is required');
        }
        if (!preDeploymentCategorizer) {
            throw new Error('preDeploymentCategorizer is required');
        }
        if (!templateParser) {
            throw new Error('templateParser is required');
        }

        this.stackRepository = stackRepository;
        this.resourceDetector = resourceDetector;
        this.categorizer = preDeploymentCategorizer;
        this.templateParser = templateParser;
    }

    async execute({ stackIdentifier, templatePath, onProgress }) {
        const progress = (step, message) => onProgress?.(step, message);

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

        progress('📄 Step 3/6:', 'Parsing deployment template...');
        const parsedTemplate = await this.templateParser.parseTemplate(templatePath);
        const expectedResources = parsedTemplate.resources || {};

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

        progress('📊 Step 5/6:', 'Checking service quotas...');
        const quotaIssues = await this.resourceDetector.checkServiceQuotas({
            stackIdentifier,
            expectedResources,
        });

        issues.push(...quotaIssues);

        progress('🏷️  Step 6/6:', 'Categorizing issues...');
        const categorizedIssues = issues.map(issue => ({
            issue,
            category: this.categorizer.categorize(issue),
        }));

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
        return RunPreDeploymentHealthCheckUseCase.DEPLOYABLE_STATES.includes(stackStatus);
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

module.exports = RunPreDeploymentHealthCheckUseCase;
