const { IValidationPipeline } = require('../../../../src/domain/interfaces/validation-pipeline');

describe('IValidationPipeline Interface', () => {
    describe('interface contract', () => {
        it('should define required methods', () => {
            const pipeline = new IValidationPipeline();

            expect(typeof pipeline.validate).toBe('function');
            expect(typeof pipeline.calculateConfidence).toBe('function');
            expect(typeof pipeline.getRecommendation).toBe('function');
        });

        it('validate should throw NotImplementedError by default', async () => {
            const pipeline = new IValidationPipeline();

            await expect(pipeline.validate([])).rejects.toThrow('Not implemented');
        });
    });

    describe('ValidationResult structure', () => {
        it('should contain required fields', () => {
            const result = {
                confidence: 92,
                layers: {
                    schema: { passed: true, score: 100, errors: [] },
                    patterns: { passed: true, score: 95, violations: [] },
                    security: { passed: true, score: 100, vulnerabilities: [] },
                    tests: { passed: false, score: 78, coverage: 78, failures: [] },
                    lint: { passed: true, score: 100, errors: [] }
                },
                recommendation: 'require_review',
                feedback: []
            };

            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('layers');
            expect(result).toHaveProperty('recommendation');
            expect(result.layers).toHaveProperty('schema');
            expect(result.layers).toHaveProperty('patterns');
            expect(result.layers).toHaveProperty('security');
            expect(result.layers).toHaveProperty('tests');
            expect(result.layers).toHaveProperty('lint');
        });
    });

    describe('recommendation values', () => {
        it('should return auto_approve for confidence >= 95', () => {
            const pipeline = new IValidationPipeline();
            pipeline.getRecommendation = (confidence) => {
                if (confidence >= 95) return 'auto_approve';
                if (confidence >= 80) return 'require_review';
                return 'manual_approval';
            };

            expect(pipeline.getRecommendation(95)).toBe('auto_approve');
            expect(pipeline.getRecommendation(100)).toBe('auto_approve');
        });

        it('should return require_review for confidence 80-94', () => {
            const pipeline = new IValidationPipeline();
            pipeline.getRecommendation = (confidence) => {
                if (confidence >= 95) return 'auto_approve';
                if (confidence >= 80) return 'require_review';
                return 'manual_approval';
            };

            expect(pipeline.getRecommendation(80)).toBe('require_review');
            expect(pipeline.getRecommendation(94)).toBe('require_review');
        });

        it('should return manual_approval for confidence < 80', () => {
            const pipeline = new IValidationPipeline();
            pipeline.getRecommendation = (confidence) => {
                if (confidence >= 95) return 'auto_approve';
                if (confidence >= 80) return 'require_review';
                return 'manual_approval';
            };

            expect(pipeline.getRecommendation(79)).toBe('manual_approval');
            expect(pipeline.getRecommendation(50)).toBe('manual_approval');
        });
    });
});
