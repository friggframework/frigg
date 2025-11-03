/**
 * Frigg Doctor Command
 *
 * Performs comprehensive health check on deployed CloudFormation stack
 * and reports issues like property drift, orphaned resources, and missing resources.
 *
 * Usage:
 *   frigg doctor <stack-name>
 *   frigg doctor my-app-prod --region us-east-1
 *   frigg doctor my-app-prod --format json --output report.json
 *   frigg doctor  # Interactive stack selection
 */

const path = require('path');
const fs = require('fs');
const { select } = require('@inquirer/prompts');
const { CloudFormationClient, ListStacksCommand } = require('@aws-sdk/client-cloudformation');

// Domain and Application Layer
const StackIdentifier = require('../../infrastructure/domains/health/domain/value-objects/stack-identifier');
const RunHealthCheckUseCase = require('../../infrastructure/domains/health/application/use-cases/run-health-check-use-case');

// Infrastructure Layer - AWS Adapters
const AWSStackRepository = require('../../infrastructure/domains/health/infrastructure/adapters/aws-stack-repository');
const AWSResourceDetector = require('../../infrastructure/domains/health/infrastructure/adapters/aws-resource-detector');

// Domain Services
const MismatchAnalyzer = require('../../infrastructure/domains/health/domain/services/mismatch-analyzer');
const HealthScoreCalculator = require('../../infrastructure/domains/health/domain/services/health-score-calculator');

/**
 * Format health report for console output
 * @param {StackHealthReport} report - Health check report
 * @param {Object} options - Formatting options
 * @returns {string} Formatted output
 */
function formatConsoleOutput(report, options = {}) {
    const lines = [];
    const summary = report.getSummary();

    // Header
    lines.push('');
    lines.push('═'.repeat(80));
    lines.push(`  FRIGG DOCTOR - Stack Health Report`);
    lines.push('═'.repeat(80));
    lines.push('');

    // Stack Information
    lines.push(`Stack:        ${summary.stackName}`);
    lines.push(`Region:       ${summary.region}`);
    lines.push(`Timestamp:    ${summary.timestamp}`);
    lines.push('');

    // Health Score
    const scoreIcon = report.healthScore.isHealthy() ? '✓' : report.healthScore.isUnhealthy() ? '✗' : '⚠';
    const scoreColor = report.healthScore.isHealthy() ? '' : '';
    lines.push(`Health Score: ${scoreIcon} ${summary.healthScore}/100 (${summary.qualitativeAssessment})`);
    lines.push('');

    // Summary Statistics
    lines.push('─'.repeat(80));
    lines.push('Resources:');
    lines.push(`  Total:      ${summary.resourceCount}`);
    lines.push(`  In Stack:   ${report.getResourcesInStack().length}`);
    lines.push(`  Drifted:    ${summary.driftedResourceCount}`);
    lines.push(`  Orphaned:   ${summary.orphanedResourceCount}`);
    lines.push(`  Missing:    ${summary.missingResourceCount}`);
    lines.push('');

    lines.push('Issues:');
    lines.push(`  Total:      ${summary.issueCount}`);
    lines.push(`  Critical:   ${summary.criticalIssueCount}`);
    lines.push(`  Warnings:   ${summary.warningCount}`);
    lines.push('');

    // Issues Detail
    if (report.issues.length > 0) {
        lines.push('─'.repeat(80));
        lines.push('Issue Details:');
        lines.push('');

        // Group issues by type
        const criticalIssues = report.getCriticalIssues();
        const warnings = report.getWarnings();

        if (criticalIssues.length > 0) {
            lines.push('  CRITICAL ISSUES:');
            criticalIssues.forEach((issue, idx) => {
                lines.push(`    ${idx + 1}. [${issue.type}] ${issue.description}`);
                lines.push(`       Resource: ${issue.resourceType} (${issue.resourceId})`);
                if (issue.resolution) {
                    lines.push(`       Fix: ${issue.resolution}`);
                }
                lines.push('');
            });
        }

        if (warnings.length > 0) {
            lines.push('  WARNINGS:');
            warnings.forEach((issue, idx) => {
                lines.push(`    ${idx + 1}. [${issue.type}] ${issue.description}`);
                lines.push(`       Resource: ${issue.resourceType} (${issue.resourceId})`);
                if (issue.resolution) {
                    lines.push(`       Fix: ${issue.resolution}`);
                }
                lines.push('');
            });
        }
    } else {
        lines.push('─'.repeat(80));
        lines.push('✓ No issues detected - stack is healthy!');
        lines.push('');
    }

    // Recommendations
    if (report.issues.length > 0) {
        lines.push('─'.repeat(80));
        lines.push('Recommended Actions:');
        lines.push('');

        if (report.getOrphanedResourceCount() > 0) {
            lines.push(`  • Import ${report.getOrphanedResourceCount()} orphaned resource(s):`);
            lines.push(`    $ frigg repair --import <stack-name>`);
            lines.push('');
        }

        if (report.getDriftedResourceCount() > 0) {
            lines.push(`  • Reconcile property drift for ${report.getDriftedResourceCount()} resource(s):`);
            lines.push(`    $ frigg repair --reconcile <stack-name>`);
            lines.push('');
        }

        if (report.getMissingResourceCount() > 0) {
            lines.push(`  • Investigate ${report.getMissingResourceCount()} missing resource(s) and redeploy:`);
            lines.push(`    $ frigg deploy --stage <stage>`);
            lines.push('');
        }
    }

    lines.push('═'.repeat(80));
    lines.push('');

    return lines.join('\n');
}

/**
 * Format health report as JSON
 * @param {StackHealthReport} report - Health check report
 * @returns {string} JSON output
 */
function formatJsonOutput(report) {
    return JSON.stringify(report.toJSON(), null, 2);
}

/**
 * Write output to file
 * @param {string} content - Content to write
 * @param {string} filePath - Output file path
 */
function writeOutputFile(content, filePath) {
    try {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`\n✓ Report saved to: ${filePath}`);
    } catch (error) {
        console.error(`\n✗ Failed to write output file: ${error.message}`);
        process.exit(1);
    }
}

/**
 * List CloudFormation stacks in the specified region
 * @param {string} region - AWS region
 * @returns {Promise<Array>} Array of stack objects with name and status
 */
async function listStacks(region) {
    const client = new CloudFormationClient({ region });

    try {
        const command = new ListStacksCommand({
            StackStatusFilter: [
                'CREATE_COMPLETE',
                'UPDATE_COMPLETE',
                'UPDATE_ROLLBACK_COMPLETE',
                'ROLLBACK_COMPLETE',
            ],
        });

        const response = await client.send(command);

        return (response.StackSummaries || []).map(stack => ({
            name: stack.StackName,
            status: stack.StackStatus,
            createdTime: stack.CreationTime,
            updatedTime: stack.LastUpdatedTime,
        }));
    } catch (error) {
        throw new Error(`Failed to list CloudFormation stacks: ${error.message}`);
    }
}

/**
 * Prompt user to select a stack from available stacks
 * @param {string} region - AWS region
 * @returns {Promise<string>} Selected stack name
 */
async function promptForStackSelection(region) {
    console.log(`\n🔍 Fetching CloudFormation stacks in ${region}...`);

    const stacks = await listStacks(region);

    if (stacks.length === 0) {
        console.error(`\n✗ No CloudFormation stacks found in ${region}`);
        console.log('  Make sure you have stacks deployed and the correct AWS credentials configured.');
        process.exit(1);
    }

    console.log(`\n✓ Found ${stacks.length} stack(s)\n`);

    // Create choices with stack name and metadata
    const choices = stacks.map(stack => {
        const statusIcon = stack.status.includes('COMPLETE') ? '✓' : '⚠';
        const timeInfo = stack.updatedTime
            ? `Updated: ${stack.updatedTime.toLocaleDateString()}`
            : `Created: ${stack.createdTime.toLocaleDateString()}`;

        return {
            name: `${statusIcon} ${stack.name} (${stack.status}) - ${timeInfo}`,
            value: stack.name,
            description: `Status: ${stack.status}`,
        };
    });

    const selectedStack = await select({
        message: 'Select a stack to run health check:',
        choices,
        pageSize: 15,
    });

    return selectedStack;
}

/**
 * Execute health check
 * @param {string} stackName - CloudFormation stack name (optional - will prompt if not provided)
 * @param {Object} options - Command options
 */
async function doctorCommand(stackName, options = {}) {
    try {
        // Extract options with defaults
        const region = options.region || process.env.AWS_REGION || 'us-east-1';
        const format = options.format || 'console';
        const verbose = options.verbose || false;

        // If no stack name provided, prompt user to select from available stacks
        if (!stackName) {
            stackName = await promptForStackSelection(region);
        }

        // Show progress to user (always, not just verbose mode)
        console.log(`\n🏥 Running health check on stack: ${stackName} (${region})\n`);

        // 1. Create stack identifier
        const stackIdentifier = new StackIdentifier({ stackName, region });

        // 2. Wire up infrastructure layer (AWS adapters)
        const stackRepository = new AWSStackRepository({ region });
        const resourceDetector = new AWSResourceDetector({ region });

        // 3. Wire up domain services
        const mismatchAnalyzer = new MismatchAnalyzer();
        const healthScoreCalculator = new HealthScoreCalculator();

        // 4. Create and execute use case with progress logging
        const runHealthCheckUseCase = new RunHealthCheckUseCase({
            stackRepository,
            resourceDetector,
            mismatchAnalyzer,
            healthScoreCalculator,
        });

        // Progress callback to show execution status
        const progressCallback = (step, message) => {
            if (verbose) {
                console.log(`   ${message}`);
            } else {
                console.log(`${step} ${message}`);
            }
        };

        const report = await runHealthCheckUseCase.execute({
            stackIdentifier,
            onProgress: progressCallback
        });

        console.log('✓ Health check complete!\n');

        // 5. Format and output results
        if (format === 'json') {
            const jsonOutput = formatJsonOutput(report);

            if (options.output) {
                writeOutputFile(jsonOutput, options.output);
            } else {
                console.log(jsonOutput);
            }
        } else {
            const consoleOutput = formatConsoleOutput(report, options);
            console.log(consoleOutput);

            if (options.output) {
                writeOutputFile(consoleOutput, options.output);
            }
        }

        // 6. Exit with appropriate code
        // Exit code 0 = healthy, 1 = unhealthy, 2 = degraded
        if (report.healthScore.isUnhealthy()) {
            process.exit(1);
        } else if (report.healthScore.isDegraded()) {
            process.exit(2);
        } else {
            process.exit(0);
        }
    } catch (error) {
        console.error(`\n✗ Health check failed: ${error.message}`);

        if (options.verbose && error.stack) {
            console.error(`\nStack trace:\n${error.stack}`);
        }

        process.exit(1);
    }
}

module.exports = { doctorCommand };
