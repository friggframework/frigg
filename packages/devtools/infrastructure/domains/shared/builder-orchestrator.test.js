/**
 * Tests for BuilderOrchestrator
 * 
 * Tests orchestration, dependency resolution, and parallel execution
 */

const { BuilderOrchestrator } = require('./builder-orchestrator');
const { InfrastructureBuilder, ValidationResult } = require('./base-builder');

// Mock builders for testing
class MockBuilderA extends InfrastructureBuilder {
    getName() { return 'MockBuilderA'; }
    shouldExecute(appDef) { return appDef.featureA === true; }
    validate(appDef) { return new ValidationResult(); }
    async build(appDef, discovered) {
        return {
            resources: { ResourceA: { Type: 'Test' } },
            iamStatements: [{ Effect: 'Allow', Action: 'test:A' }],
        };
    }
}

class MockBuilderB extends InfrastructureBuilder {
    getName() { return 'MockBuilderB'; }
    shouldExecute(appDef) { return appDef.featureB === true; }
    validate(appDef) { return new ValidationResult(); }
    getDependencies() { return ['MockBuilderA']; }  // Depends on A
    async build(appDef, discovered) {
        return {
            resources: { ResourceB: { Type: 'Test' } },
            environment: { VAR_B: 'value-b' },
        };
    }
}

class MockBuilderC extends InfrastructureBuilder {
    getName() { return 'MockBuilderC'; }
    shouldExecute() { return false; }  // Never executes
    validate() { return new ValidationResult(); }
    async build() {
        throw new Error('Should not be called');
    }
}

jest.mock('./resource-discovery', () => ({
    gatherDiscoveredResources: jest.fn().mockResolvedValue({ discovered: true }),
}));

jest.mock('./environment-builder', () => ({
    getAppEnvironmentVars: jest.fn().mockReturnValue({ ENV_VAR: 'value' }),
    buildEnvironment: jest.fn().mockReturnValue({ ENV_VAR: 'value' }),
}));

describe('BuilderOrchestrator', () => {
    let orchestrator;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('registerBuilder()', () => {
        it('should register builders', () => {
            orchestrator = new BuilderOrchestrator();
            const builder = new MockBuilderA();

            orchestrator.registerBuilder(builder);

            expect(orchestrator.builders.has('MockBuilderA')).toBe(true);
        });

        it('should register multiple builders via constructor', () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderA(),
                new MockBuilderB(),
            ]);

            expect(orchestrator.builders.size).toBe(2);
        });
    });

    describe('validateAll()', () => {
        it('should validate all applicable builders', async () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderA(),
                new MockBuilderB(),
            ]);

            const appDef = { featureA: true, featureB: true };

            await expect(orchestrator.validateAll(appDef)).resolves.toBeDefined();
        });

        it('should skip builders that shouldNotExecute', async () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderA(),
                new MockBuilderC(),  // Should not execute
            ]);

            const appDef = { featureA: true };

            const results = await orchestrator.validateAll(appDef);

            // Should only validate MockBuilderA
            expect(results).toHaveLength(1);
            expect(results[0].builder).toBe('MockBuilderA');
        });

        it('should throw error if validation fails', async () => {
            class FailingBuilder extends InfrastructureBuilder {
                getName() { return 'FailingBuilder'; }
                shouldExecute() { return true; }
                validate() {
                    const result = new ValidationResult();
                    result.addError('Test error');
                    return result;
                }
            }

            orchestrator = new BuilderOrchestrator([new FailingBuilder()]);

            await expect(orchestrator.validateAll({})).rejects.toThrow('Infrastructure validation failed');
        });
    });

    describe('resolveBuildOrder()', () => {
        it('should resolve dependencies correctly', () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderB(),  // Depends on A
                new MockBuilderA(),  // No dependencies
            ]);

            const appDef = { featureA: true, featureB: true };
            const order = orchestrator.resolveBuildOrder(appDef);

            // A should come before B
            expect(order).toEqual(['MockBuilderA', 'MockBuilderB']);
        });

        it('should handle builders with no dependencies', () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderA(),
            ]);

            const appDef = { featureA: true };
            const order = orchestrator.resolveBuildOrder(appDef);

            expect(order).toEqual(['MockBuilderA']);
        });

        it('should skip builders that should not execute', () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderA(),
                new MockBuilderC(),  // Should not execute
            ]);

            const appDef = { featureA: true };
            const order = orchestrator.resolveBuildOrder(appDef);

            expect(order).toEqual(['MockBuilderA']);
        });
    });

    describe('buildAll()', () => {
        it('should build all infrastructure and merge results', async () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderA(),
                new MockBuilderB(),
            ]);

            const appDef = { featureA: true, featureB: true };

            const result = await orchestrator.buildAll(appDef);

            expect(result.merged).toBeDefined();
            expect(result.merged.resources).toMatchObject({
                ResourceA: { Type: 'Test' },
                ResourceB: { Type: 'Test' },
            });
            expect(result.merged.iamStatements).toHaveLength(1);
            expect(result.merged.environment).toMatchObject({ VAR_B: 'value-b' });
        });

        it('should skip builders that should not execute', async () => {
            orchestrator = new BuilderOrchestrator([
                new MockBuilderA(),
                new MockBuilderC(),  // Should not execute
            ]);

            const appDef = { featureA: true };

            const result = await orchestrator.buildAll(appDef);

            // Should only have results from A
            expect(Object.keys(result.merged.resources)).toEqual(['ResourceA']);
        });

        it('should throw error if builder fails', async () => {
            class FailingBuilder extends InfrastructureBuilder {
                getName() { return 'FailingBuilder'; }
                shouldExecute() { return true; }
                validate() { return new ValidationResult(); }
                async build() {
                    throw new Error('Build failed');
                }
            }

            orchestrator = new BuilderOrchestrator([new FailingBuilder()]);

            await expect(orchestrator.buildAll({})).rejects.toThrow('Build failed');
        });
    });
});

