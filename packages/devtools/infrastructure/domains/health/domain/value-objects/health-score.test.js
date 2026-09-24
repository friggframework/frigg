/**
 * Tests for HealthScore Value Object
 */

const HealthScore = require('./health-score');

describe('HealthScore', () => {
    describe('constructor', () => {
        it('should create health score with valid value', () => {
            const score = new HealthScore(75);

            expect(score.value).toBe(75);
        });

        it('should accept 0 as minimum score', () => {
            const score = new HealthScore(0);

            expect(score.value).toBe(0);
        });

        it('should accept 100 as maximum score', () => {
            const score = new HealthScore(100);

            expect(score.value).toBe(100);
        });

        it('should reject negative scores', () => {
            expect(() => {
                new HealthScore(-1);
            }).toThrow('Health score must be between 0 and 100');
        });

        it('should reject scores above 100', () => {
            expect(() => {
                new HealthScore(101);
            }).toThrow('Health score must be between 0 and 100');
        });

        it('should reject non-numeric scores', () => {
            expect(() => {
                new HealthScore('75');
            }).toThrow('Health score must be a number');
        });

        it('should reject NaN', () => {
            expect(() => {
                new HealthScore(NaN);
            }).toThrow('Health score must be a number');
        });

        it('should reject Infinity', () => {
            expect(() => {
                new HealthScore(Infinity);
            }).toThrow('Health score must be a number');
        });
    });

    describe('qualitativeAssessment', () => {
        it('should return "healthy" for score 100', () => {
            const score = new HealthScore(100);

            expect(score.qualitativeAssessment()).toBe('healthy');
        });

        it('should return "healthy" for score 90', () => {
            const score = new HealthScore(90);

            expect(score.qualitativeAssessment()).toBe('healthy');
        });

        it('should return "healthy" for score 80', () => {
            const score = new HealthScore(80);

            expect(score.qualitativeAssessment()).toBe('healthy');
        });

        it('should return "degraded" for score 79', () => {
            const score = new HealthScore(79);

            expect(score.qualitativeAssessment()).toBe('degraded');
        });

        it('should return "degraded" for score 50', () => {
            const score = new HealthScore(50);

            expect(score.qualitativeAssessment()).toBe('degraded');
        });

        it('should return "degraded" for score 40', () => {
            const score = new HealthScore(40);

            expect(score.qualitativeAssessment()).toBe('degraded');
        });

        it('should return "unhealthy" for score 39', () => {
            const score = new HealthScore(39);

            expect(score.qualitativeAssessment()).toBe('unhealthy');
        });

        it('should return "unhealthy" for score 0', () => {
            const score = new HealthScore(0);

            expect(score.qualitativeAssessment()).toBe('unhealthy');
        });
    });

    describe('isHealthy', () => {
        it('should return true for score 80', () => {
            const score = new HealthScore(80);

            expect(score.isHealthy()).toBe(true);
        });

        it('should return true for score 100', () => {
            const score = new HealthScore(100);

            expect(score.isHealthy()).toBe(true);
        });

        it('should return false for score 79', () => {
            const score = new HealthScore(79);

            expect(score.isHealthy()).toBe(false);
        });

        it('should return false for score 0', () => {
            const score = new HealthScore(0);

            expect(score.isHealthy()).toBe(false);
        });
    });

    describe('isDegraded', () => {
        it('should return true for score 79', () => {
            const score = new HealthScore(79);

            expect(score.isDegraded()).toBe(true);
        });

        it('should return true for score 40', () => {
            const score = new HealthScore(40);

            expect(score.isDegraded()).toBe(true);
        });

        it('should return false for score 80', () => {
            const score = new HealthScore(80);

            expect(score.isDegraded()).toBe(false);
        });

        it('should return false for score 39', () => {
            const score = new HealthScore(39);

            expect(score.isDegraded()).toBe(false);
        });
    });

    describe('isUnhealthy', () => {
        it('should return true for score 39', () => {
            const score = new HealthScore(39);

            expect(score.isUnhealthy()).toBe(true);
        });

        it('should return true for score 0', () => {
            const score = new HealthScore(0);

            expect(score.isUnhealthy()).toBe(true);
        });

        it('should return false for score 40', () => {
            const score = new HealthScore(40);

            expect(score.isUnhealthy()).toBe(false);
        });

        it('should return false for score 80', () => {
            const score = new HealthScore(80);

            expect(score.isUnhealthy()).toBe(false);
        });
    });

    describe('toString', () => {
        it('should return string representation for healthy score', () => {
            const score = new HealthScore(100);

            expect(score.toString()).toBe('100 (healthy)');
        });

        it('should return string representation for degraded score', () => {
            const score = new HealthScore(50);

            expect(score.toString()).toBe('50 (degraded)');
        });

        it('should return string representation for unhealthy score', () => {
            const score = new HealthScore(25);

            expect(score.toString()).toBe('25 (unhealthy)');
        });
    });

    describe('static factory methods', () => {
        it('should create perfect score', () => {
            const score = HealthScore.perfect();

            expect(score.value).toBe(100);
            expect(score.isHealthy()).toBe(true);
        });

        it('should create failed score', () => {
            const score = HealthScore.failed();

            expect(score.value).toBe(0);
            expect(score.isUnhealthy()).toBe(true);
        });

        it('should create from percentage (1.0 = 100)', () => {
            const score = HealthScore.fromPercentage(0.75);

            expect(score.value).toBe(75);
        });

        it('should create from percentage (0.0 = 0)', () => {
            const score = HealthScore.fromPercentage(0);

            expect(score.value).toBe(0);
        });

        it('should create from percentage (1.0 = 100)', () => {
            const score = HealthScore.fromPercentage(1.0);

            expect(score.value).toBe(100);
        });

        it('should reject percentage below 0', () => {
            expect(() => {
                HealthScore.fromPercentage(-0.1);
            }).toThrow('Percentage must be between 0 and 1');
        });

        it('should reject percentage above 1', () => {
            expect(() => {
                HealthScore.fromPercentage(1.1);
            }).toThrow('Percentage must be between 0 and 1');
        });
    });

    describe('immutability', () => {
        it('should not allow modification of value', () => {
            const score = new HealthScore(75);

            expect(() => {
                score.value = 50;
            }).toThrow();
        });

        it('should be frozen', () => {
            const score = new HealthScore(75);

            expect(Object.isFrozen(score)).toBe(true);
        });
    });
});
