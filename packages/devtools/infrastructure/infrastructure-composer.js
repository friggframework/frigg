/**
 * Infrastructure Composer
 * 
 * Application Layer - Hexagonal Architecture
 * 
 * Orchestrates the composition of serverless infrastructure definitions
 * using domain builders and shared utilities.
 */

// Domain Builders
const { BuilderOrchestrator } = require('./domains/shared/builder-orchestrator');
const { VpcBuilder } = require('./domains/networking/vpc-builder');
const { KmsBuilder } = require('./domains/security/kms-builder');
const { AuroraBuilder } = require('./domains/database/aurora-builder');
const { MigrationBuilder } = require('./domains/database/migration-builder');
const { SsmBuilder } = require('./domains/parameters/ssm-builder');
const { WebsocketBuilder } = require('./domains/integration/websocket-builder');
const { IntegrationBuilder } = require('./domains/integration/integration-builder');
const { SchedulerBuilder } = require('./domains/scheduler/scheduler-builder');
const { AdminScriptBuilder } = require('./domains/admin-scripts/admin-script-builder');

// Utilities
const { applyFunctionEnvironments } = require('./domains/shared/function-environments');
const { modifyHandlerPaths } = require('./domains/shared/utilities/handler-path-resolver');
const { createBaseDefinition } = require('./domains/shared/utilities/base-definition-factory');
const { ensurePrismaLayerExists } = require('./domains/shared/utilities/prisma-layer-manager');
const { validateAndCleanPlugins, validatePackagingConfiguration } = require('./domains/shared/validation/plugin-validator');

/**
 * Compose serverless definition using domain builders
 * 
 * This is the main entry point that orchestrates all infrastructure building
 * using the DDD/Hexagonal architecture pattern.
 */
const composeServerlessDefinition = async (AppDefinition) => {
    console.log('🏗️  Composing serverless definition with domain builders...');

    // Determine if deployment should use Prisma Lambda Layer (default: true)
    const usePrismaLayer = AppDefinition.usePrismaLambdaLayer !== false;

    // Ensure Prisma layer exists only when configured to use it
    if (usePrismaLayer) {
        await ensurePrismaLayerExists(AppDefinition.database || {});
    } else {
        console.log('📦 Skipping Prisma Lambda Layer (usePrismaLambdaLayer=false - bundling Prisma with functions)');
    }

    // Create orchestrator with all domain builders
    const orchestrator = new BuilderOrchestrator([
        new VpcBuilder(),
        new KmsBuilder(),
        new AuroraBuilder(),
        new MigrationBuilder(), // Add migration infrastructure after Aurora
        new SsmBuilder(),
        new WebsocketBuilder(),
        new IntegrationBuilder(),
        new SchedulerBuilder(), // Add scheduler after IntegrationBuilder (depends on it)
        new AdminScriptBuilder(),
    ]);

    // Build all infrastructure (orchestrator handles validation, dependencies, parallel execution)
    // Builders automatically skip if shouldExecute() returns false (e.g., local mode)
    const { merged, discoveredResources, appEnvironmentVars } =
        await orchestrator.buildAll(AppDefinition);

    // Create base definition with core functions
    const definition = createBaseDefinition(
        AppDefinition,
        appEnvironmentVars,
        discoveredResources,
        usePrismaLayer
    );

    // Merge builder results into definition
    Object.assign(definition.resources.Resources, merged.resources);
    definition.provider.iamRoleStatements.push(...merged.iamStatements);
    Object.assign(definition.provider.environment, merged.environment);
    Object.assign(definition.functions, merged.functions);
    applyFunctionEnvironments(
        definition.functions,
        merged.functionEnvironments
    );

    if (merged.vpcConfig) {
        definition.provider.vpc = merged.vpcConfig;
    }

    // Add unique plugins (avoid duplicates)
    merged.plugins.forEach(plugin => {
        if (!definition.plugins.includes(plugin)) {
            definition.plugins.push(plugin);
        }
    });

    Object.assign(definition.custom, merged.custom);

    // Validate and clean plugins (detect conflicts, auto-fix if needed)
    const pluginValidation = validateAndCleanPlugins(definition.plugins, {
        autoFix: true,
        silent: false,
    });

    if (pluginValidation.modified) {
        definition.plugins = pluginValidation.plugins;
        console.log('   ✓ Plugin configuration auto-fixed');
    }

    // Validate packaging configuration
    const packagingValidation = validatePackagingConfiguration(definition);
    if (!packagingValidation.valid) {
        console.warn('⚠️  Packaging configuration issues detected:');
        packagingValidation.errors.forEach(err => console.warn(`   ✗ ${err}`));
    }
    if (packagingValidation.warnings.length > 0) {
        packagingValidation.warnings.forEach(warn => console.warn(`   ℹ ${warn}`));
    }

    // Modify handler paths for offline mode
    definition.functions = modifyHandlerPaths(definition.functions);

    console.log('✅ Serverless definition composed successfully');
    return definition;
};

module.exports = { composeServerlessDefinition };

