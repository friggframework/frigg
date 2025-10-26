/**
 * Frigg Repair Command
 *
 * Repairs infrastructure issues detected by frigg doctor:
 * - Import orphaned resources into CloudFormation stack
 * - Reconcile property drift between template and actual resources
 *
 * Usage:
 *   frigg repair --import <stack-name>
 *   frigg repair --reconcile <stack-name>
 *   frigg repair --import --reconcile <stack-name>  # Fix all issues
 */

const path = require('path');
const readline = require('readline');

// Domain and Application Layer
const StackIdentifier = require('@friggframework/devtools/infrastructure/domains/health/domain/value-objects/stack-identifier');
const RunHealthCheckUseCase = require('@friggframework/devtools/infrastructure/domains/health/application/use-cases/run-health-check-use-case');
const RepairViaImportUseCase = require('@friggframework/devtools/infrastructure/domains/health/application/use-cases/repair-via-import-use-case');
const ReconcilePropertiesUseCase = require('@friggframework/devtools/infrastructure/domains/health/application/use-cases/reconcile-properties-use-case');

// Infrastructure Layer - AWS Adapters
const AWSStackRepository = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/aws-stack-repository');
const AWSResourceDetector = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/aws-resource-detector');
const AWSResourceImporter = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/aws-resource-importer');
const AWSPropertyReconciler = require('@friggframework/devtools/infrastructure/domains/health/infrastructure/adapters/aws-property-reconciler');

// Domain Services
const MismatchAnalyzer = require('@friggframework/devtools/infrastructure/domains/health/domain/services/mismatch-analyzer');
const HealthScoreCalculator = require('@friggframework/devtools/infrastructure/domains/health/domain/services/health-score-calculator');

/**
 * Create readline interface for user prompts
 * @returns {readline.Interface}
 */
function createReadlineInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
}

/**
 * Prompt user for confirmation
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} User confirmed
 */
function confirm(question) {
    const rl = createReadlineInterface();

    return new Promise((resolve) => {
        rl.question(`${question} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

/**
 * Handle import repair operation
 * @param {StackIdentifier} stackIdentifier - Stack identifier
 * @param {Object} report - Health check report
 * @param {Object} options - Command options
 */
async function handleImportRepair(stackIdentifier, report, options) {
    const orphanedResources = report.getOrphanedResources();

    if (orphanedResources.length === 0) {
        console.log('\n✓ No orphaned resources to import');
        return { imported: 0, failed: 0 };
    }

    console.log(`\n📦 Found ${orphanedResources.length} orphaned resource(s) to import:`);
    orphanedResources.forEach((resource, idx) => {
        console.log(`  ${idx + 1}. ${resource.resourceType} - ${resource.physicalId}`);
    });

    // Confirm with user (unless --yes flag)
    if (!options.yes) {
        const confirmed = await confirm(`\nImport ${orphanedResources.length} orphaned resource(s)?`);
        if (!confirmed) {
            console.log('Import cancelled by user');
            return { imported: 0, failed: 0, cancelled: true };
        }
    }

    // Wire up use case
    const resourceDetector = new AWSResourceDetector({ region: stackIdentifier.region });
    const resourceImporter = new AWSResourceImporter({ region: stackIdentifier.region });
    const repairUseCase = new RepairViaImportUseCase({ resourceDetector, resourceImporter });

    // Prepare resources for import
    const resourcesToImport = orphanedResources.map((resource, idx) => ({
        logicalId: `ImportedResource${idx + 1}`, // Generate logical ID
        physicalId: resource.physicalId,
        resourceType: resource.resourceType,
    }));

    // Execute import
    console.log('\n🔧 Importing resources...');
    const importResult = await repairUseCase.importMultipleResources({
        stackIdentifier,
        resources: resourcesToImport,
    });

    // Report results
    if (importResult.success) {
        console.log(`\n✓ Successfully imported ${importResult.importedCount} resource(s)`);
    } else {
        console.log(`\n✗ Import failed: ${importResult.message}`);
        if (importResult.validationErrors && importResult.validationErrors.length > 0) {
            console.log('\nValidation errors:');
            importResult.validationErrors.forEach((error) => {
                console.log(`  • ${error.logicalId}: ${error.reason}`);
            });
        }
    }

    return {
        imported: importResult.importedCount,
        failed: importResult.failedCount,
        success: importResult.success,
    };
}

/**
 * Handle property reconciliation repair operation
 * @param {StackIdentifier} stackIdentifier - Stack identifier
 * @param {Object} report - Health check report
 * @param {Object} options - Command options
 */
async function handleReconcileRepair(stackIdentifier, report, options) {
    const driftedResources = report.getDriftedResources();

    if (driftedResources.length === 0) {
        console.log('\n✓ No property drift to reconcile');
        return { reconciled: 0, failed: 0 };
    }

    // Count total property mismatches
    let totalMismatches = 0;
    driftedResources.forEach((resource) => {
        const issues = report.issues.filter(
            (issue) => issue.type === 'PROPERTY_MISMATCH' && issue.resourceId === resource.physicalId
        );
        totalMismatches += issues.length;
    });

    console.log(`\n🔧 Found ${driftedResources.length} drifted resource(s) with ${totalMismatches} property mismatch(es):`);
    driftedResources.forEach((resource) => {
        const issues = report.issues.filter(
            (issue) => issue.type === 'PROPERTY_MISMATCH' && issue.resourceId === resource.physicalId
        );
        console.log(`  • ${resource.logicalId} (${resource.resourceType}): ${issues.length} mismatch(es)`);
    });

    // Determine mode (template or resource)
    const mode = options.mode || 'template';
    const modeDescription = mode === 'template'
        ? 'Update CloudFormation template to match actual resource state'
        : 'Update cloud resources to match CloudFormation template';

    console.log(`\nReconciliation mode: ${mode}`);
    console.log(`  ${modeDescription}`);

    // Confirm with user (unless --yes flag)
    if (!options.yes) {
        const confirmed = await confirm(`\nReconcile ${totalMismatches} property mismatch(es) in ${mode} mode?`);
        if (!confirmed) {
            console.log('Reconciliation cancelled by user');
            return { reconciled: 0, failed: 0, cancelled: true };
        }
    }

    // Wire up use case
    const propertyReconciler = new AWSPropertyReconciler({ region: stackIdentifier.region });
    const reconcileUseCase = new ReconcilePropertiesUseCase({ propertyReconciler });

    // Execute reconciliation for each drifted resource
    console.log('\n🔧 Reconciling property drift...');
    let reconciledCount = 0;
    let failedCount = 0;

    for (const resource of driftedResources) {
        // Get property mismatches for this resource
        const resourceIssues = report.issues.filter(
            (issue) => issue.type === 'PROPERTY_MISMATCH' && issue.resourceId === resource.physicalId
        );

        if (resourceIssues.length === 0) continue;

        const mismatches = resourceIssues.map((issue) => issue.propertyMismatch);

        try {
            const result = await reconcileUseCase.reconcileMultipleProperties({
                stackIdentifier,
                logicalId: resource.logicalId,
                mismatches,
                mode,
            });

            reconciledCount += result.reconciledCount;
            failedCount += result.failedCount;

            console.log(`  ✓ ${resource.logicalId}: Reconciled ${result.reconciledCount} property(ies)`);
            if (result.skippedCount > 0) {
                console.log(`    (Skipped ${result.skippedCount} immutable property(ies))`);
            }
        } catch (error) {
            failedCount++;
            console.log(`  ✗ ${resource.logicalId}: ${error.message}`);
        }
    }

    // Report results
    if (failedCount === 0) {
        console.log(`\n✓ Successfully reconciled ${reconciledCount} property mismatch(es)`);
    } else {
        console.log(`\n⚠ Reconciled ${reconciledCount} property(ies), ${failedCount} failed`);
    }

    return { reconciled: reconciledCount, failed: failedCount, success: failedCount === 0 };
}

/**
 * Execute repair operations
 * @param {string} stackName - CloudFormation stack name
 * @param {Object} options - Command options
 */
async function repairCommand(stackName, options = {}) {
    try {
        // Validate required parameter
        if (!stackName) {
            console.error('Error: Stack name is required');
            console.log('Usage: frigg repair [options] <stack-name>');
            console.log('Options:');
            console.log('  --import      Import orphaned resources');
            console.log('  --reconcile   Reconcile property drift');
            console.log('  --yes         Skip confirmation prompts');
            process.exit(1);
        }

        // Validate at least one repair operation is selected
        if (!options.import && !options.reconcile) {
            console.error('Error: At least one repair operation must be specified (--import or --reconcile)');
            console.log('Usage: frigg repair [options] <stack-name>');
            process.exit(1);
        }

        // Extract options with defaults
        const region = options.region || process.env.AWS_REGION || 'us-east-1';
        const verbose = options.verbose || false;

        console.log(`\n🏥 Running Frigg Repair on stack: ${stackName} (${region})`);

        // 1. Create stack identifier
        const stackIdentifier = new StackIdentifier({ stackName, region });

        // 2. Run health check first to identify issues
        console.log('\n🔍 Running health check to identify issues...');

        const stackRepository = new AWSStackRepository({ region });
        const resourceDetector = new AWSResourceDetector({ region });
        const mismatchAnalyzer = new MismatchAnalyzer();
        const healthScoreCalculator = new HealthScoreCalculator();

        const runHealthCheckUseCase = new RunHealthCheckUseCase({
            stackRepository,
            resourceDetector,
            mismatchAnalyzer,
            healthScoreCalculator,
        });

        const report = await runHealthCheckUseCase.execute({ stackIdentifier });

        console.log(`\nHealth Score: ${report.healthScore.value}/100 (${report.healthScore.qualitativeAssessment()})`);
        console.log(`Issues: ${report.getIssueCount()} total (${report.getCriticalIssueCount()} critical)`);

        // 3. Execute requested repair operations
        const results = {
            imported: 0,
            reconciled: 0,
            failed: 0,
        };

        if (options.import) {
            const importResult = await handleImportRepair(stackIdentifier, report, options);
            if (!importResult.cancelled) {
                results.imported = importResult.imported || 0;
                results.failed += importResult.failed || 0;
            }
        }

        if (options.reconcile) {
            const reconcileResult = await handleReconcileRepair(stackIdentifier, report, options);
            if (!reconcileResult.cancelled) {
                results.reconciled = reconcileResult.reconciled || 0;
                results.failed += reconcileResult.failed || 0;
            }
        }

        // 4. Final summary
        console.log('\n' + '═'.repeat(80));
        console.log('Repair Summary:');
        if (options.import) {
            console.log(`  Imported:    ${results.imported} resource(s)`);
        }
        if (options.reconcile) {
            console.log(`  Reconciled:  ${results.reconciled} property(ies)`);
        }
        console.log(`  Failed:      ${results.failed}`);
        console.log('═'.repeat(80));

        // Run health check again to verify repairs
        console.log('\n🔍 Running health check to verify repairs...');
        const verifyReport = await runHealthCheckUseCase.execute({ stackIdentifier });
        console.log(`\nNew Health Score: ${verifyReport.healthScore.value}/100 (${verifyReport.healthScore.qualitativeAssessment()})`);

        if (verifyReport.healthScore.value > report.healthScore.value) {
            console.log(`\n✓ Health improved by ${verifyReport.healthScore.value - report.healthScore.value} points!`);
        }

        // 5. Exit with appropriate code
        if (results.failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }
    } catch (error) {
        console.error(`\n✗ Repair failed: ${error.message}`);

        if (options.verbose && error.stack) {
            console.error(`\nStack trace:\n${error.stack}`);
        }

        process.exit(1);
    }
}

module.exports = { repairCommand };
