/**
 * Infrastructure Builder Orchestrator
 * 
 * Application Layer - Hexagonal Architecture
 * 
 * Orchestrates the execution of all infrastructure builders with:
 * - Dependency resolution
 * - Parallel execution where possible
 * - Error handling and validation
 * - Progress reporting
 */

const { gatherDiscoveredResources } = require('./resource-discovery');
const { getAppEnvironmentVars, buildEnvironment } = require('./environment-builder');

class BuilderOrchestrator {
    constructor(builders = []) {
        this.builders = new Map();
        builders.forEach(builder => this.registerBuilder(builder));
    }

    /**
     * Register a builder
     */
    registerBuilder(builder) {
        this.builders.set(builder.getName(), builder);
    }

    /**
     * Validate all applicable builders
     */
    async validateAll(appDefinition) {
        console.log('\n🔍 Validating infrastructure configuration...');

        const validationResults = [];
        let hasErrors = false;

        for (const [name, builder] of this.builders) {
            if (builder.shouldExecute(appDefinition)) {
                const result = builder.validate(appDefinition);
                validationResults.push({ builder: name, result });

                if (result.hasErrors()) {
                    hasErrors = true;
                    console.log(`❌ ${name} validation failed:`);
                    result.errors.forEach(error => console.log(`   - ${error}`));
                }

                if (result.hasWarnings()) {
                    console.log(`⚠️  ${name} warnings:`);
                    result.warnings.forEach(warning => console.log(`   - ${warning}`));
                }
            }
        }

        if (hasErrors) {
            throw new Error('Infrastructure validation failed. See errors above.');
        }

        console.log('✅ All infrastructure validation passed\n');
        return validationResults;
    }

    /**
     * Resolve builder execution order based on dependencies
     */
    resolveBuildOrder(appDefinition) {
        const executionOrder = [];
        const visited = new Set();
        const visiting = new Set();

        const visit = (builderName) => {
            if (visited.has(builderName)) return;
            if (visiting.has(builderName)) {
                throw new Error(`Circular dependency detected: ${builderName}`);
            }

            const builder = this.builders.get(builderName);
            if (!builder || !builder.shouldExecute(appDefinition)) {
                return;
            }

            visiting.add(builderName);

            // Visit dependencies first
            const dependencies = builder.getDependencies() || [];
            dependencies.forEach(dep => visit(dep));

            visiting.delete(builderName);
            visited.add(builderName);
            executionOrder.push(builderName);
        };

        // Visit all builders
        for (const [builderName] of this.builders) {
            visit(builderName);
        }

        return executionOrder;
    }

    /**
     * Build all infrastructure
     */
    async buildAll(appDefinition) {
        console.log('\n🏗️  Building infrastructure...');

        // Step 1: Validate configuration
        await this.validateAll(appDefinition);

        // Step 2: Discover AWS resources
        const discoveredResources = await gatherDiscoveredResources(appDefinition);

        // Step 3: Resolve build order
        const buildOrder = this.resolveBuildOrder(appDefinition);
        console.log(`📋 Build order: ${buildOrder.join(' → ')}\n`);

        // Step 4: Execute builders in order
        const buildResults = {};

        for (const builderName of buildOrder) {
            const builder = this.builders.get(builderName);
            try {
                const result = await builder.build(appDefinition, discoveredResources);
                buildResults[builderName] = result;
            } catch (error) {
                console.error(`❌ ${builderName} build failed:`, error.message);
                throw error;
            }
        }

        // Step 5: Merge results
        return this.mergeResults(buildResults, appDefinition, discoveredResources);
    }

    /**
     * Merge builder results into cohesive definition
     */
    mergeResults(buildResults, appDefinition, discoveredResources) {
        console.log('\n🔗 Merging infrastructure results...');

        const merged = {
            resources: {},
            iamStatements: [],
            environment: {},
            functions: {},
            layers: {},
            plugins: [],
            custom: {},
            vpcConfig: null,
        };

        // Merge results from each builder
        for (const [builderName, result] of Object.entries(buildResults)) {
            // Merge resources
            if (result.resources) {
                Object.assign(merged.resources, result.resources);
            }

            // Merge IAM statements
            if (result.iamStatements) {
                merged.iamStatements.push(...result.iamStatements);
            }

            // Merge environment variables
            if (result.environment) {
                Object.assign(merged.environment, result.environment);
            }

            // Merge functions
            if (result.functions) {
                Object.assign(merged.functions, result.functions);
            }

            // Merge layers
            if (result.layers) {
                Object.assign(merged.layers, result.layers);
            }

            // Merge plugins
            if (result.plugins) {
                merged.plugins.push(...result.plugins);
            }

            // Merge custom configuration
            if (result.pluginConfig) {
                Object.assign(merged.custom, result.pluginConfig);
            }
            if (result.custom) {
                Object.assign(merged.custom, result.custom);
            }

            // Capture VPC config (from VpcBuilder)
            if (result.vpcConfig) {
                merged.vpcConfig = result.vpcConfig;
            }

            console.log(`  ✓ Merged ${builderName} results`);
        }

        console.log('✅ Infrastructure build completed successfully\n');

        return {
            merged,
            discoveredResources,
            appEnvironmentVars: getAppEnvironmentVars(appDefinition),
        };
    }
}

module.exports = { BuilderOrchestrator };

