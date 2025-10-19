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

// Utilities
const { modifyHandlerPaths } = require('./domains/shared/utilities/handler-path-resolver');
const { createBaseDefinition } = require('./domains/shared/utilities/base-definition-factory');
const { ensurePrismaLayerExists } = require('./domains/shared/utilities/prisma-layer-manager');

/**
 * Compose serverless definition using domain builders
 * 
 * This is the main entry point that orchestrates all infrastructure building
 * using the DDD/Hexagonal architecture pattern.
 */
const composeServerlessDefinition = async (AppDefinition) => {
    console.log('🏗️  Composing serverless definition with domain builders...');

    // Ensure Prisma layer exists (minimal, runtime only)
    await ensurePrismaLayerExists(AppDefinition.database || {});

    // Create orchestrator with all domain builders
    const orchestrator = new BuilderOrchestrator([
        new VpcBuilder(),
        new KmsBuilder(),
        new AuroraBuilder(),
        new MigrationBuilder(), // Add migration infrastructure after Aurora
        new SsmBuilder(),
        new WebsocketBuilder(),
        new IntegrationBuilder(),
    ]);

    // Build all infrastructure (orchestrator handles validation, dependencies, parallel execution)
    // Builders automatically skip if shouldExecute() returns false (e.g., local mode)
    const { merged, discoveredResources, appEnvironmentVars } =
        await orchestrator.buildAll(AppDefinition);

    // Create base definition with core functions
    const definition = createBaseDefinition(
        AppDefinition,
        appEnvironmentVars,
        discoveredResources
    );

    // Merge builder results into definition
    Object.assign(definition.resources.Resources, merged.resources);
    definition.provider.iamRoleStatements.push(...merged.iamStatements);
    Object.assign(definition.provider.environment, merged.environment);
    Object.assign(definition.functions, merged.functions);

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

    // Modify handler paths for offline mode
    definition.functions = modifyHandlerPaths(definition.functions);

    console.log('✅ Serverless definition composed successfully');
    return definition;
};

module.exports = { composeServerlessDefinition };

