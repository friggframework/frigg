const path = require('path');
const fs = require('fs');
const { select, confirm, input } = require('@inquirer/prompts');
const { CloudFormationClient, ListStacksCommand } = require('@aws-sdk/client-cloudformation');
const { EC2Client } = require('@aws-sdk/client-ec2');
const { ElasticLoadBalancingV2Client } = require('@aws-sdk/client-elastic-load-balancing-v2');
const { RDSClient } = require('@aws-sdk/client-rds');
const { LambdaClient } = require('@aws-sdk/client-lambda');

const StackIdentifier = require('@friggframework/devtools/infrastructure/domains/health/domain/value-objects/stack-identifier');
const CleanupOrphanedResourcesUseCase = require('@friggframework/devtools/infrastructure/domains/health/application/use-cases/cleanup-orphaned-resources-use-case');

const AWSResourceDetector = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/aws-resource-detector');
const ResourceDependencyAnalyzer = require('@friggframework/devtools/infrastructure/domains/health/domain/services/resource-dependency-analyzer');
const ResourceDeletionPlanner = require('@friggframework/devtools/infrastructure/domains/health/domain/services/resource-deletion-planner');
const ResourceDeleterRepository = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/resource-deleter-repository');
const AuditLogRepository = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/audit-log-repository');

function formatConsoleOutput(result, options = {}) {
    const lines = [];
    const { deletionPlan } = result;

    lines.push('');
    lines.push('═'.repeat(80));
    lines.push('  🧹 FRIGG CLEANUP - Orphaned Resources');
    lines.push('═'.repeat(80));
    lines.push('');

    if (result.dryRun) {
        lines.push('Mode: DRY-RUN (no resources will be deleted)');
    } else {
        lines.push('Mode: EXECUTE (resources WILL be deleted)');
    }
    lines.push('');

    if (!deletionPlan) {
        lines.push(result.message || 'No orphaned resources found');
        lines.push('');
        return lines.join('\n');
    }

    lines.push('─'.repeat(80));
    lines.push('📊 CLEANUP SUMMARY');
    lines.push('');
    lines.push(`Total resources: ${deletionPlan.totalResources}`);
    lines.push(`  • Can delete: ${deletionPlan.deletableCount}`);
    lines.push(`  • Blocked: ${deletionPlan.blockedCount}`);
    lines.push('');

    if (deletionPlan.resourcesByType) {
        lines.push('Resources by type:');
        Object.entries(deletionPlan.resourcesByType).forEach(([type, count]) => {
            const shortType = type.replace('AWS::EC2::', '');
            lines.push(`  • ${shortType}: ${count}`);
        });
        lines.push('');
    }

    if (deletionPlan.costSavings && deletionPlan.costSavings.monthly > 0) {
        lines.push(
            `Estimated monthly savings: $${deletionPlan.costSavings.monthly.toFixed(2)}`
        );
        lines.push('');
    }

    const totalPhaseResources =
        deletionPlan.phases.phase1.length +
        deletionPlan.phases.phase2.length +
        deletionPlan.phases.phase3.length;

    if (totalPhaseResources > 0) {
        lines.push('Deletion order:');
        if (deletionPlan.phases.phase1.length > 0) {
            lines.push(`  Phase 1: ${deletionPlan.phases.phase1.length} resources`);
        }
        if (deletionPlan.phases.phase2.length > 0) {
            lines.push(`  Phase 2: ${deletionPlan.phases.phase2.length} resources`);
        }
        if (deletionPlan.phases.phase3.length > 0) {
            lines.push(`  Phase 3: ${deletionPlan.phases.phase3.length} resources`);
        }
        lines.push('');
    }

    if (deletionPlan.blockedResources && deletionPlan.blockedResources.length > 0) {
        lines.push('─'.repeat(80));
        lines.push('⚠️  BLOCKED RESOURCES (cannot be deleted):');
        lines.push('');
        deletionPlan.blockedResources.forEach((blocked) => {
            const { resource, blockingDependencies } = blocked;
            lines.push(`  ${resource.physicalId} (${resource.resourceType})`);
            blockingDependencies.forEach((dep) => {
                lines.push(`    • ${dep.type}: ${dep.count} resources`);
            });
            lines.push('');
        });
    }

    if (deletionPlan.warnings && deletionPlan.warnings.length > 0) {
        lines.push('─'.repeat(80));
        lines.push('⚠️  SAFETY WARNINGS:');
        lines.push('');
        deletionPlan.warnings.forEach((warning) => {
            lines.push(`  • ${warning}`);
        });
        lines.push('');
    }

    if (result.dryRun) {
        lines.push('─'.repeat(80));
        lines.push('');
        lines.push('To delete these resources, run:');
        lines.push('  frigg cleanup --orphaned --execute');
        lines.push('');
    } else {
        lines.push('─'.repeat(80));
        lines.push('');
        lines.push('✅ CLEANUP COMPLETE');
        lines.push('');
        lines.push(`Successfully deleted: ${result.deletedCount} resources`);
        if (result.failedCount > 0) {
            lines.push(`Failed: ${result.failedCount} resources`);
        }
        if (result.skippedCount > 0) {
            lines.push(`Skipped (blocked): ${result.skippedCount} resources`);
        }
        lines.push('');

        if (result.costSavings && result.costSavings.monthly > 0) {
            lines.push(
                `Estimated monthly savings: $${result.costSavings.monthly.toFixed(2)}`
            );
            lines.push('');
        }
    }

    return lines.join('\n');
}

function formatJsonOutput(result) {
    return JSON.stringify(result, null, 2);
}

async function getStackList(region) {
    const client = new CloudFormationClient({ region });
    const command = new ListStacksCommand({
        StackStatusFilter: [
            'CREATE_COMPLETE',
            'UPDATE_COMPLETE',
            'ROLLBACK_COMPLETE',
            'UPDATE_ROLLBACK_COMPLETE',
        ],
    });

    const response = await client.send(command);
    return response.StackSummaries || [];
}

async function selectStackInteractively(region) {
    const stacks = await getStackList(region);

    if (stacks.length === 0) {
        throw new Error(`No CloudFormation stacks found in region ${region}`);
    }

    const stackName = await select({
        message: 'Select a stack to clean up:',
        choices: stacks.map((stack) => ({
            name: `${stack.StackName} (${stack.StackStatus})`,
            value: stack.StackName,
        })),
    });

    return stackName;
}

async function confirmDeletion(deletionPlan, stackName) {
    console.log('');
    console.log('═'.repeat(80));
    console.log('⚠️  WARNING: You are about to DELETE AWS resources');
    console.log('═'.repeat(80));
    console.log('');
    console.log('This action:');
    console.log('  • Cannot be easily undone');
    console.log('  • Will permanently delete resources from AWS');
    console.log('  • May affect running applications if dependencies exist');
    console.log('');
    console.log(`Resources to delete: ${deletionPlan.deletableCount}`);
    if (deletionPlan.resourcesByType) {
        Object.entries(deletionPlan.resourcesByType).forEach(([type, count]) => {
            const shortType = type.replace('AWS::EC2::', '');
            console.log(`  • ${shortType}: ${count}`);
        });
    }
    console.log('');

    const confirmationText = await input({
        message: `Type 'delete ${stackName}' to confirm:`,
    });

    return confirmationText === `delete ${stackName}`;
}

async function runCleanupCommand(argv) {
    const stackName = argv._[1];
    const region = argv.region || process.env.AWS_REGION || 'us-east-1';
    const dryRun = !argv.execute;
    const autoConfirm = argv.yes || false;
    const outputFormat = argv.output || argv.format || 'console';
    const resourceTypeFilter = argv['resource-type'] || null;
    const logicalIdPattern = argv['logical-id'] || null;

    let resolvedStackName = stackName;
    if (!resolvedStackName) {
        resolvedStackName = await selectStackInteractively(region);
    }

    const stackIdentifier = new StackIdentifier({
        stackName: resolvedStackName,
        region,
        accountId: '000000000000',
    });

    const ec2Client = new EC2Client({ region });
    const elbClient = new ElasticLoadBalancingV2Client({ region });
    const rdsClient = new RDSClient({ region });
    const lambdaClient = new LambdaClient({ region });

    const useCase = new CleanupOrphanedResourcesUseCase({
        resourceDetector: new AWSResourceDetector({ region }),
        dependencyAnalyzer: new ResourceDependencyAnalyzer({
            ec2Client,
            elbClient,
            rdsClient,
            lambdaClient,
        }),
        deletionPlanner: new ResourceDeletionPlanner(),
        deleterRepository: new ResourceDeleterRepository({ ec2Client, region }),
        auditRepository: new AuditLogRepository(),
    });

    if (!dryRun && outputFormat === 'console') {
        const dryRunResult = await useCase.execute({
            stackIdentifier,
            dryRun: true,
            resourceTypeFilter,
            logicalIdPattern,
        });

        if (
            !dryRunResult.deletionPlan ||
            dryRunResult.deletionPlan.deletableCount === 0
        ) {
            console.log(formatConsoleOutput(dryRunResult));
            return;
        }

        if (!autoConfirm) {
            const confirmed = await confirmDeletion(
                dryRunResult.deletionPlan,
                resolvedStackName
            );
            if (!confirmed) {
                console.log('');
                console.log('Cleanup cancelled.');
                console.log('');
                return;
            }
        }
    }

    const progressHandler =
        outputFormat === 'console'
            ? (progress) => {
                  if (progress.phase) {
                      console.log(`\n${progress.message}`);
                  } else if (progress.current) {
                      const status = progress.success ? '✓' : '✗';
                      console.log(
                          `  [${progress.current}/${progress.total}] ${status} ${progress.physicalId}`
                      );
                  }
              }
            : null;

    const result = await useCase.execute({
        stackIdentifier,
        dryRun,
        resourceTypeFilter,
        logicalIdPattern,
        onProgress: progressHandler,
    });

    if (outputFormat === 'json') {
        console.log(formatJsonOutput(result));
    } else {
        console.log(formatConsoleOutput(result));
    }

    if (argv['output-file']) {
        const outputPath = path.resolve(argv['output-file']);
        const content =
            outputFormat === 'json'
                ? formatJsonOutput(result)
                : formatConsoleOutput(result);
        fs.writeFileSync(outputPath, content, 'utf8');
        console.log(`Report written to: ${outputPath}`);
    }
}

module.exports = runCleanupCommand;
