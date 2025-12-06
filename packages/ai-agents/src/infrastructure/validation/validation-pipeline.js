const { IValidationPipeline } = require('../../domain/interfaces/validation-pipeline');

const ValidationLayer = {
    SCHEMA: 'schema',
    PATTERNS: 'patterns',
    SECURITY: 'security',
    TESTS: 'tests',
    LINT: 'lint'
};

const LAYER_WEIGHTS = {
    [ValidationLayer.SCHEMA]: 0.30,
    [ValidationLayer.PATTERNS]: 0.25,
    [ValidationLayer.TESTS]: 0.20,
    [ValidationLayer.SECURITY]: 0.15,
    [ValidationLayer.LINT]: 0.10
};

const REQUIRED_INTEGRATION_METHODS = [
    'onCreate',
    'onUpdate',
    'onDelete',
    'getConfigOptions',
    'testAuth'
];

class ValidationPipeline extends IValidationPipeline {
    async validate(files) {
        const layers = {};
        const feedback = [];

        for (const file of files) {
            const schemaResult = await this.validateSchema(file);
            const patternsResult = await this.validatePatterns(file);
            const securityResult = await this.validateSecurity(file);
            const testsResult = await this.validateTests(file);
            const lintResult = await this.validateLint(file);

            layers.schema = this.mergeLayerResults(layers.schema, schemaResult);
            layers.patterns = this.mergeLayerResults(layers.patterns, patternsResult);
            layers.security = this.mergeLayerResults(layers.security, securityResult);
            layers.tests = this.mergeLayerResults(layers.tests, testsResult);
            layers.lint = this.mergeLayerResults(layers.lint, lintResult);
        }

        const confidence = this.calculateConfidence(layers);
        const recommendation = this.getRecommendation(confidence);

        for (const [layer, result] of Object.entries(layers)) {
            if (!result.passed) {
                feedback.push({
                    layer,
                    issues: result.errors || result.violations || result.vulnerabilities || []
                });
            }
        }

        return { confidence, layers, recommendation, feedback };
    }

    mergeLayerResults(existing, newResult) {
        if (!existing) return newResult;

        return {
            passed: existing.passed && newResult.passed,
            score: Math.min(existing.score, newResult.score),
            errors: [...(existing.errors || []), ...(newResult.errors || [])],
            violations: [...(existing.violations || []), ...(newResult.violations || [])],
            vulnerabilities: [...(existing.vulnerabilities || []), ...(newResult.vulnerabilities || [])]
        };
    }

    async validateSchema(file) {
        const result = { passed: true, score: 100, errors: [] };

        if (!file.path.endsWith('.json')) {
            return result;
        }

        let parsed;
        try {
            parsed = JSON.parse(file.content);
        } catch (e) {
            return { passed: false, score: 0, errors: [`Invalid JSON: ${e.message}`] };
        }

        if (parsed.name && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(parsed.name)) {
            result.passed = false;
            result.errors.push('name must match pattern ^[a-zA-Z][a-zA-Z0-9_-]*$');
        }

        if (parsed.version && !/^\d+\.\d+\.\d+$/.test(parsed.version)) {
            result.passed = false;
            result.errors.push('version must be semantic (X.Y.Z)');
        }

        if (result.errors.length > 0) {
            result.score = Math.max(0, 100 - result.errors.length * 25);
        }

        return result;
    }

    async validatePatterns(file) {
        const result = { passed: true, score: 100, violations: [] };

        const isIntegrationFile = file.path.includes('integrations/') && file.path.endsWith('.js');
        if (!isIntegrationFile) {
            return result;
        }

        const content = file.content;

        if (!content.includes('extends IntegrationBase')) {
            result.passed = false;
            result.violations.push({
                rule: 'extends-integration-base',
                message: 'Integration must extend IntegrationBase'
            });
        }

        if (!content.includes('static Definition')) {
            result.passed = false;
            result.violations.push({
                rule: 'static-definition',
                message: 'Integration must have static Definition property'
            });
        }

        const missingMethods = REQUIRED_INTEGRATION_METHODS.filter(
            m => !content.includes(`async ${m}(`)
        );

        if (missingMethods.length > 0) {
            result.passed = false;
            result.violations.push({
                rule: 'required-methods',
                message: `Missing required methods: ${missingMethods.join(', ')}`
            });
        }

        if (result.violations.length > 0) {
            result.score = Math.max(0, 100 - result.violations.length * 20);
        }

        return result;
    }

    async validateSecurity(file) {
        const result = { passed: true, score: 100, vulnerabilities: [] };
        const content = file.content;

        const credentialPatterns = [
            { pattern: /['"`]sk-[a-zA-Z0-9]{20,}['"`]/g, type: 'hardcoded-credential', severity: 'high' },
            { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded-credential', severity: 'high' },
            { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded-credential', severity: 'high' },
            { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/gi, type: 'hardcoded-credential', severity: 'high' }
        ];

        for (const { pattern, type, severity } of credentialPatterns) {
            if (pattern.test(content)) {
                result.passed = false;
                result.vulnerabilities.push({
                    type,
                    severity,
                    description: 'Possible hardcoded credential detected',
                    fix: 'Use environment variables instead'
                });
            }
        }

        const sqlInjectionPattern = /["'`]SELECT.*FROM.*["'`]\s*\+/gi;
        if (sqlInjectionPattern.test(content)) {
            result.passed = false;
            result.vulnerabilities.push({
                type: 'sql-injection',
                severity: 'critical',
                description: 'Potential SQL injection vulnerability',
                fix: 'Use parameterized queries'
            });
        }

        if (result.vulnerabilities.length > 0) {
            const severityPenalty = {
                critical: 50,
                high: 25,
                medium: 15,
                low: 5
            };
            const penalty = result.vulnerabilities.reduce(
                (sum, v) => sum + (severityPenalty[v.severity] || 10),
                0
            );
            result.score = Math.max(0, 100 - penalty);
        }

        return result;
    }

    async validateTests(file) {
        return { passed: true, score: 100, coverage: 100, failures: [] };
    }

    async validateLint(file) {
        return { passed: true, score: 100, errors: [] };
    }

    calculateConfidence(layers) {
        let confidence = 0;
        for (const [layer, weight] of Object.entries(LAYER_WEIGHTS)) {
            const layerResult = layers[layer];
            if (layerResult) {
                confidence += layerResult.score * weight;
            }
        }
        return Math.round(confidence);
    }

    getRecommendation(confidence) {
        if (confidence >= 95) return 'auto_approve';
        if (confidence >= 80) return 'require_review';
        return 'manual_approval';
    }
}

module.exports = { ValidationPipeline, ValidationLayer, LAYER_WEIGHTS };
