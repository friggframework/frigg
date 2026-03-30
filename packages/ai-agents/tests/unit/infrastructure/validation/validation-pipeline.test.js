const { ValidationPipeline, ValidationLayer } = require('../../../../src/infrastructure/validation/validation-pipeline');

describe('ValidationPipeline', () => {
    let pipeline;

    beforeEach(() => {
        pipeline = new ValidationPipeline();
    });

    describe('ValidationLayer', () => {
        it('should define all layer types', () => {
            expect(ValidationLayer.SCHEMA).toBe('schema');
            expect(ValidationLayer.PATTERNS).toBe('patterns');
            expect(ValidationLayer.SECURITY).toBe('security');
            expect(ValidationLayer.TESTS).toBe('tests');
            expect(ValidationLayer.LINT).toBe('lint');
        });
    });

    describe('validate', () => {
        it('should validate files and return confidence score', async () => {
            const files = [
                {
                    path: 'src/integrations/hubspot.js',
                    content: `
const { IntegrationBase } = require('@friggframework/core');

class HubspotIntegration extends IntegrationBase {
    static Definition = {
        name: 'hubspot',
        version: '1.0.0',
        modules: {},
        display: { name: 'HubSpot', description: 'HubSpot integration' }
    };

    async onCreate(params) {}
    async onUpdate(params) {}
    async onDelete(params) {}
    async getConfigOptions() { return { jsonSchema: {}, uiSchema: {} }; }
    async testAuth() { return true; }
}

module.exports = { HubspotIntegration };
`,
                    action: 'create'
                }
            ];

            const result = await pipeline.validate(files);

            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('layers');
            expect(result).toHaveProperty('recommendation');
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(100);
        });

        it('should run all validation layers', async () => {
            const files = [{ path: 'test.js', content: 'const x = 1;', action: 'create' }];
            const result = await pipeline.validate(files);

            expect(result.layers).toHaveProperty('schema');
            expect(result.layers).toHaveProperty('patterns');
            expect(result.layers).toHaveProperty('security');
            expect(result.layers).toHaveProperty('tests');
            expect(result.layers).toHaveProperty('lint');
        });

        it('should return auto_approve for high confidence', async () => {
            const files = [
                {
                    path: 'src/integrations/perfect.js',
                    content: `
const { IntegrationBase } = require('@friggframework/core');

class PerfectIntegration extends IntegrationBase {
    static Definition = {
        name: 'perfect',
        version: '1.0.0',
        modules: {},
        display: { name: 'Perfect', description: 'Perfect integration' }
    };

    async onCreate(params) {}
    async onUpdate(params) {}
    async onDelete(params) {}
    async getConfigOptions() { return { jsonSchema: {}, uiSchema: {} }; }
    async testAuth() { return true; }
}

module.exports = { PerfectIntegration };
`,
                    action: 'create'
                }
            ];

            const result = await pipeline.validate(files);

            if (result.confidence >= 95) {
                expect(result.recommendation).toBe('auto_approve');
            }
        });
    });

    describe('schema validation layer', () => {
        it('should pass valid integration definition', async () => {
            const content = JSON.stringify({
                name: 'hubspot',
                version: '1.0.0',
                modules: {},
                display: { name: 'HubSpot', description: 'HubSpot integration' }
            });

            const result = await pipeline.validateSchema({ path: 'definition.json', content });

            expect(result.passed).toBe(true);
            expect(result.score).toBeGreaterThan(0);
        });

        it('should fail invalid integration definition', async () => {
            const content = JSON.stringify({
                name: '123invalid',
                version: 'not-semver'
            });

            const result = await pipeline.validateSchema({ path: 'definition.json', content });

            expect(result.passed).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should skip non-JSON files', async () => {
            const result = await pipeline.validateSchema({
                path: 'code.js',
                content: 'const x = 1;'
            });

            expect(result.passed).toBe(true);
            expect(result.score).toBe(100);
        });
    });

    describe('patterns validation layer', () => {
        it('should pass integration with required patterns', async () => {
            const content = `
class MyIntegration extends IntegrationBase {
    static Definition = { name: 'test', version: '1.0.0' };
    async onCreate() {}
    async onUpdate() {}
    async onDelete() {}
    async getConfigOptions() {}
    async testAuth() {}
}`;

            const result = await pipeline.validatePatterns({
                path: 'src/integrations/test.js',
                content
            });

            expect(result.passed).toBe(true);
        });

        it('should detect missing required methods', async () => {
            const content = `
class MyIntegration extends IntegrationBase {
    static Definition = { name: 'test' };
    async onCreate() {}
}`;

            const result = await pipeline.validatePatterns({
                path: 'src/integrations/test.js',
                content
            });

            expect(result.passed).toBe(false);
            expect(result.violations.length).toBeGreaterThan(0);
        });

        it('should skip non-integration files', async () => {
            const result = await pipeline.validatePatterns({
                path: 'utils/helpers.js',
                content: 'const x = 1;'
            });

            expect(result.passed).toBe(true);
            expect(result.score).toBe(100);
        });
    });

    describe('security validation layer', () => {
        it('should detect hardcoded credentials', async () => {
            const content = `const apiKey = 'sk-1234567890abcdef';`;

            const result = await pipeline.validateSecurity({
                path: 'config.js',
                content
            });

            expect(result.passed).toBe(false);
            expect(result.vulnerabilities.length).toBeGreaterThan(0);
            expect(result.vulnerabilities[0].type).toBe('hardcoded-credential');
        });

        it('should pass secure code', async () => {
            const content = `const apiKey = process.env.API_KEY;`;

            const result = await pipeline.validateSecurity({
                path: 'config.js',
                content
            });

            expect(result.passed).toBe(true);
        });

        it('should detect SQL injection risks', async () => {
            const content = `const query = "SELECT * FROM users WHERE id = " + userId;`;

            const result = await pipeline.validateSecurity({
                path: 'db.js',
                content
            });

            expect(result.passed).toBe(false);
            expect(result.vulnerabilities.some(v => v.type === 'sql-injection')).toBe(true);
        });
    });

    describe('calculateConfidence', () => {
        it('should weight layers correctly', () => {
            const layers = {
                schema: { score: 100 },
                patterns: { score: 100 },
                security: { score: 100 },
                tests: { score: 100 },
                lint: { score: 100 }
            };

            const confidence = pipeline.calculateConfidence(layers);
            expect(confidence).toBe(100);
        });

        it('should apply weights: schema 30%, patterns 25%, tests 20%, security 15%, lint 10%', () => {
            const layers = {
                schema: { score: 0 },
                patterns: { score: 100 },
                security: { score: 100 },
                tests: { score: 100 },
                lint: { score: 100 }
            };

            const confidence = pipeline.calculateConfidence(layers);
            expect(confidence).toBe(70);
        });
    });

    describe('getRecommendation', () => {
        it('should return auto_approve for >= 95', () => {
            expect(pipeline.getRecommendation(95)).toBe('auto_approve');
            expect(pipeline.getRecommendation(100)).toBe('auto_approve');
        });

        it('should return require_review for 80-94', () => {
            expect(pipeline.getRecommendation(80)).toBe('require_review');
            expect(pipeline.getRecommendation(94)).toBe('require_review');
        });

        it('should return manual_approval for < 80', () => {
            expect(pipeline.getRecommendation(79)).toBe('manual_approval');
            expect(pipeline.getRecommendation(50)).toBe('manual_approval');
        });
    });

    describe('feedback generation', () => {
        it('should generate feedback for failed layers', async () => {
            const files = [
                {
                    path: 'src/integrations/bad.js',
                    content: `const secret = 'password123';`,
                    action: 'create'
                }
            ];

            const result = await pipeline.validate(files);

            expect(result.feedback.length).toBeGreaterThan(0);
        });
    });
});
