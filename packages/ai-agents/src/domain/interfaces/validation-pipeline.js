const { NotImplementedError } = require('./agent-framework');

const WEIGHTS = {
    schema: 0.30,
    patterns: 0.25,
    security: 0.15,
    tests: 0.20,
    lint: 0.10
};

const THRESHOLDS = {
    autoApprove: 95,
    requireReview: 80
};

class IValidationPipeline {
    async validate(_files) {
        throw new NotImplementedError('validate');
    }

    calculateConfidence(layerResults) {
        let totalScore = 0;

        for (const [layer, weight] of Object.entries(WEIGHTS)) {
            const result = layerResults[layer];
            if (result && typeof result.score === 'number') {
                totalScore += result.score * weight;
            }
        }

        return Math.round(totalScore);
    }

    getRecommendation(confidence, thresholds = THRESHOLDS) {
        if (confidence >= thresholds.autoApprove) {
            return 'auto_approve';
        }
        if (confidence >= thresholds.requireReview) {
            return 'require_review';
        }
        return 'manual_approval';
    }

    generateFeedback(layerResults) {
        const feedback = [];

        for (const [layer, result] of Object.entries(layerResults)) {
            if (!result.passed) {
                feedback.push({
                    layer,
                    score: result.score,
                    issues: result.errors || result.violations || result.vulnerabilities || result.failures || []
                });
            }
        }

        return feedback;
    }
}

module.exports = { IValidationPipeline, WEIGHTS, THRESHOLDS };
