/**
 * DryRunReporter Tests
 *
 * Test-Driven Development for the presentation layer
 */

const { DryRunReporter } = require('./DryRunReporter');
const { DryRunReport } = require('../../domain/entities/DryRunReport');
const { DryRunStatus } = require('../../domain/value-objects/DryRunStatus');
const { ValidationResult } = require('../../domain/value-objects/ValidationResult');
const { captureConsoleOutput } = require('../../__tests__/helpers/test-utils');

describe('DryRunReporter', () => {
    describe('constructor', () => {
        it('should create reporter with default console format', () => {
            const reporter = new DryRunReporter();

            expect(reporter).toBeDefined();
            expect(reporter.format).toBe('console');
        });

        it('should create reporter with specified format', () => {
            const consoleReporter = new DryRunReporter({ format: 'console' });
            const jsonReporter = new DryRunReporter({ format: 'json' });

            expect(consoleReporter.format).toBe('console');
            expect(jsonReporter.format).toBe('json');
        });

        it('should throw error for invalid format', () => {
            expect(() => new DryRunReporter({ format: 'xml' })).toThrow('Invalid format');
        });
    });

    describe('report - console format', () => {
        let reporter;
        let consoleCapture;

        beforeEach(() => {
            reporter = new DryRunReporter({ format: 'console' });
            consoleCapture = captureConsoleOutput();
        });

        afterEach(() => {
            consoleCapture.restore();
        });

        it('should display complete successful report with all sections', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);

            expect(output).toContain('Frigg Deploy Dry-Run');
            expect(output).toContain('App Configuration');
            expect(output).toContain('Environment Variables');
            expect(output).toContain('AWS Resource Discovery');
            expect(output).toContain('Generated Template Summary');
            expect(output).toContain('CloudFormation Change Set Preview');
            expect(output).toContain('Deployment Impact');
            expect(output).toContain('Dry-Run Summary');
            expect(output).toContain('Next Steps');
        });

        it('should display app configuration section', () => {
            const report = createBasicReport({
                stackName: 'my-app-production',
                region: 'us-east-1',
                stage: 'production',
            });

            const output = reporter.report(report);

            expect(output).toContain('App Configuration');
            expect(output).toContain('my-app-production');
            expect(output).toContain('production');
            expect(output).toContain('us-east-1');
        });

        it('should display environment variables with present variables', () => {
            const report = createBasicReport();
            report.setEnvironmentResult(ValidationResult.success({
                required: {
                    present: ['AWS_REGION', 'STAGE', 'DB_URI'],
                    missing: [],
                },
                optional: {
                    present: ['SENTRY_DSN'],
                    missing: [],
                },
            }));

            const output = reporter.report(report);

            expect(output).toContain('Environment Variables');
            expect(output).toContain('3 required variables present');
        });

        it('should display environment variables with warnings for missing optional vars', () => {
            const report = createBasicReport();
            report.setEnvironmentResult(
                ValidationResult.withWarnings(
                    ['2 optional variables missing'],
                    {
                        required: { present: ['AWS_REGION', 'STAGE'], missing: [] },
                        optional: { present: [], missing: ['SENTRY_DSN', 'NEW_RELIC_KEY'] },
                    }
                )
            );

            const output = reporter.report(report);

            expect(output).toContain('Environment Variables');
            expect(output).toContain('2 required variables present');
            expect(output).toContain('2 optional variables missing');
            expect(output).toContain('SENTRY_DSN');
            expect(output).toContain('NEW_RELIC_KEY');
        });

        it('should display environment variables with errors for missing required vars', () => {
            const report = createBasicReport();
            report.setEnvironmentResult(
                ValidationResult.failure(
                    ['Missing required environment variables'],
                    [],
                    {
                        required: {
                            present: ['AWS_REGION'],
                            missing: ['DB_URI', 'ENCRYPTION_KEY'],
                        },
                        optional: { present: [], missing: [] },
                    }
                )
            );

            const output = reporter.report(report);

            expect(output).toContain('Environment Variables');
            expect(output).toContain('2 required variables missing');
            expect(output).toContain('DB_URI');
            expect(output).toContain('ENCRYPTION_KEY');
        });

        it('should display AWS resource discovery section when present', () => {
            const report = createBasicReport();
            report.setDiscoveryResult({
                vpc: { id: 'vpc-12345678', cidr: '10.0.0.0/16' },
                subnets: ['subnet-11111111', 'subnet-22222222'],
                securityGroups: ['sg-12345678'],
                kmsKey: 'arn:aws:kms:us-east-1:123456789012:key/abc-123',
            });

            const output = reporter.report(report);

            expect(output).toContain('AWS Resource Discovery');
            expect(output).toContain('vpc-12345678');
            expect(output).toContain('10.0.0.0/16');
            expect(output).toContain('subnet-11111111');
            expect(output).toContain('sg-12345678');
        });

        it('should skip AWS resource discovery section when not present', () => {
            const report = createBasicReport();

            const output = reporter.report(report);

            expect(output).not.toContain('AWS Resource Discovery');
        });

        it('should display template summary section', () => {
            const report = createBasicReport();
            report.setTemplateResult({
                service: 'my-integration-production',
                functions: {
                    count: 3,
                    names: ['health', 'user', 'integration-hubspot'],
                    details: [
                        { name: 'health', memory: 256, timeout: 30 },
                        { name: 'user', memory: 512, timeout: 30 },
                        { name: 'integration-hubspot', memory: 1024, timeout: 60 },
                    ],
                },
                endpoints: {
                    count: 2,
                    methods: ['GET /health', 'POST /api/integrations'],
                },
            });

            const output = reporter.report(report);

            expect(output).toContain('Generated Template Summary');
            expect(output).toContain('Functions: 3');
            expect(output).toContain('health');
            expect(output).toContain('256MB');
            expect(output).toContain('API Endpoints: 2');
            expect(output).toContain('GET /health');
        });

        it('should display change set with no changes', () => {
            const report = createBasicReport();
            report.setChangeSetResult({
                stackName: 'my-app-dev',
                changeSetId: 'arn:aws:cloudformation:...',
                status: 'CREATE_COMPLETE',
                changes: [],
                summary: { add: 0, modify: 0, remove: 0, replace: 0 },
            });

            const output = reporter.report(report);

            expect(output).toContain('CloudFormation Change Set Preview');
            expect(output).toContain('No changes');
        });

        it('should display change set with additions', () => {
            const report = createBasicReport();
            report.setChangeSetResult({
                stackName: 'my-app-dev',
                changeSetId: 'arn:aws:cloudformation:...',
                status: 'CREATE_COMPLETE',
                changes: [
                    {
                        action: 'Add',
                        logicalId: 'HealthLambdaFunction',
                        resourceType: 'AWS::Lambda::Function',
                    },
                    {
                        action: 'Add',
                        logicalId: 'ApiGatewayRestApi',
                        resourceType: 'AWS::ApiGateway::RestApi',
                    },
                ],
                summary: { add: 2, modify: 0, remove: 0, replace: 0 },
            });

            const output = reporter.report(report);

            expect(output).toContain('CloudFormation Change Set Preview');
            expect(output).toContain('Add (2)');
            expect(output).toContain('HealthLambdaFunction');
            expect(output).toContain('AWS::Lambda::Function');
            expect(output).toContain('ApiGatewayRestApi');
        });

        it('should display change set with modifications', () => {
            const report = createBasicReport();
            report.setChangeSetResult({
                stackName: 'my-app-dev',
                changeSetId: 'arn:aws:cloudformation:...',
                status: 'CREATE_COMPLETE',
                changes: [
                    {
                        action: 'Modify',
                        logicalId: 'HealthLambdaFunction',
                        resourceType: 'AWS::Lambda::Function',
                        details: [
                            {
                                target: 'Properties',
                                attribute: 'VpcConfig.SubnetIds',
                                changeSource: 'DirectModification',
                            },
                        ],
                    },
                ],
                summary: { add: 0, modify: 1, remove: 0, replace: 0 },
            });

            const output = reporter.report(report);

            expect(output).toContain('Modify (1)');
            expect(output).toContain('HealthLambdaFunction');
            expect(output).toContain('VpcConfig.SubnetIds');
        });

        it('should display change set with replacements', () => {
            const report = createBasicReport();
            report.setChangeSetResult({
                stackName: 'my-app-dev',
                changeSetId: 'arn:aws:cloudformation:...',
                status: 'CREATE_COMPLETE',
                changes: [
                    {
                        action: 'Modify',
                        logicalId: 'DatabaseSecurityGroup',
                        resourceType: 'AWS::EC2::SecurityGroup',
                        replacement: 'True',
                        replacementReason: 'VpcId property change requires replacement',
                    },
                ],
                summary: { add: 0, modify: 0, remove: 0, replace: 1 },
            });

            const output = reporter.report(report);

            expect(output).toContain('Replace (1)');
            expect(output).toContain('DatabaseSecurityGroup');
            expect(output).toContain('VpcId property change requires replacement');
        });

        it('should display change set with removals', () => {
            const report = createBasicReport();
            report.setChangeSetResult({
                stackName: 'my-app-dev',
                changeSetId: 'arn:aws:cloudformation:...',
                status: 'CREATE_COMPLETE',
                changes: [
                    {
                        action: 'Remove',
                        logicalId: 'OldLambdaFunction',
                        resourceType: 'AWS::Lambda::Function',
                    },
                ],
                summary: { add: 0, modify: 0, remove: 1, replace: 0 },
            });

            const output = reporter.report(report);

            expect(output).toContain('Remove (1)');
            expect(output).toContain('OldLambdaFunction');
        });

        it('should display deployment impact section when present', () => {
            const report = createBasicReport();
            report.setImpactResult({
                downtime: '2-3 minutes',
                functionsAffected: 12,
                coldStarts: true,
                breakingChanges: false,
            });

            const output = reporter.report(report);

            expect(output).toContain('Deployment Impact');
            expect(output).toContain('2-3 minutes');
            expect(output).toContain('12');
            expect(output).toContain('Cold Starts Expected');
        });

        it('should display successful summary with no errors or warnings', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);

            expect(output).toContain('Dry-Run Summary');
            expect(output).toContain('completed successfully');
        });

        it('should display summary with warnings', () => {
            const report = createReportWithWarnings();

            const output = reporter.report(report);

            expect(output).toContain('completed with warnings');
            expect(output).toContain('2 optional environment variables missing');
        });

        it('should display summary with errors', () => {
            const report = createReportWithErrors();

            const output = reporter.report(report);

            expect(output).toContain('failed validation');
            expect(output).toContain('Missing required environment variables');
        });

        it('should display next steps section', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);

            expect(output).toContain('Next Steps');
            expect(output).toContain('frigg deploy');
            expect(output).toContain('--stage');
        });

        it('should not suggest execution when there are errors', () => {
            const report = createReportWithErrors();

            const output = reporter.report(report);

            expect(output).toContain('Next Steps');
            expect(output).toContain('Fix the errors');
        });
    });

    describe('report - JSON format', () => {
        let reporter;

        beforeEach(() => {
            reporter = new DryRunReporter({ format: 'json' });
        });

        it('should return valid JSON string', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);

            expect(() => JSON.parse(output)).not.toThrow();
        });

        it('should include all required fields', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);
            const json = JSON.parse(output);

            expect(json.dryRun).toBe(true);
            expect(json.timestamp).toBeDefined();
            expect(json.stackName).toBe('test-app-dev');
            expect(json.region).toBe('us-east-1');
            expect(json.stage).toBe('dev');
            expect(json.status).toBeDefined();
            expect(json.exitCode).toBeDefined();
        });

        it('should include environment validation results', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);
            const json = JSON.parse(output);

            expect(json.environment).toBeDefined();
            expect(json.environment.valid).toBe(true);
            expect(json.environment.metadata).toBeDefined();
        });

        it('should include discovery results when present', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);
            const json = JSON.parse(output);

            expect(json.discovery).toBeDefined();
            expect(json.discovery.vpc).toBeDefined();
            expect(json.discovery.vpc.id).toBe('vpc-12345678');
        });

        it('should include template summary', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);
            const json = JSON.parse(output);

            expect(json.template).toBeDefined();
            expect(json.template.functions).toBeDefined();
            expect(json.template.functions.count).toBe(3);
        });

        it('should include change set preview', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);
            const json = JSON.parse(output);

            expect(json.changeSet).toBeDefined();
            expect(json.changeSet.summary).toBeDefined();
            expect(json.changeSet.changes).toBeDefined();
        });

        it('should include impact analysis when present', () => {
            const report = createSuccessfulReport();

            const output = reporter.report(report);
            const json = JSON.parse(output);

            expect(json.impact).toBeDefined();
            expect(json.impact.downtime).toBe('2-3 minutes');
        });

        it('should include proper exit code', () => {
            const successReport = createSuccessfulReport();
            const warningReport = createReportWithWarnings();
            const errorReport = createReportWithErrors();

            const successOutput = JSON.parse(reporter.report(successReport));
            const warningOutput = JSON.parse(reporter.report(warningReport));
            const errorOutput = JSON.parse(reporter.report(errorReport));

            expect(successOutput.exitCode).toBe(0);
            expect(warningOutput.exitCode).toBe(2);
            expect(errorOutput.exitCode).toBe(1);
        });

        it('should handle null/undefined fields gracefully', () => {
            const report = createBasicReport();

            const output = reporter.report(report);
            const json = JSON.parse(output);

            expect(json.discovery).toBeNull();
            expect(json.template).toBeNull();
            expect(json.changeSet).toBeNull();
            expect(json.impact).toBeNull();
        });
    });

    describe('display method', () => {
        it('should write console output to console.log', () => {
            const reporter = new DryRunReporter({ format: 'console' });
            const report = createSuccessfulReport();
            const consoleCapture = captureConsoleOutput();

            reporter.display(report);

            expect(consoleCapture.logs.length).toBeGreaterThan(0);
            const fullOutput = consoleCapture.logs.join('\n');
            expect(fullOutput).toContain('Frigg Deploy Dry-Run');

            consoleCapture.restore();
        });

        it('should write JSON output to console.log', () => {
            const reporter = new DryRunReporter({ format: 'json' });
            const report = createSuccessfulReport();
            const consoleCapture = captureConsoleOutput();

            reporter.display(report);

            expect(consoleCapture.logs.length).toBe(1);
            expect(() => JSON.parse(consoleCapture.logs[0])).not.toThrow();

            consoleCapture.restore();
        });
    });

    describe('edge cases', () => {
        it('should handle missing environment result', () => {
            const report = createBasicReport();
            const reporter = new DryRunReporter();

            expect(() => reporter.report(report)).not.toThrow();
            const output = reporter.report(report);
            expect(output).toBeDefined();
        });

        it('should handle empty change set', () => {
            const report = createBasicReport();
            report.setChangeSetResult({
                stackName: 'test-stack',
                changeSetId: 'arn:aws:cloudformation:...',
                status: 'CREATE_COMPLETE',
                changes: [],
                summary: { add: 0, modify: 0, remove: 0, replace: 0 },
            });
            const reporter = new DryRunReporter();

            const output = reporter.report(report);

            expect(output).toContain('No changes');
        });

        it('should handle very long resource names', () => {
            const report = createBasicReport();
            report.setChangeSetResult({
                stackName: 'test-stack',
                changeSetId: 'arn:aws:cloudformation:...',
                status: 'CREATE_COMPLETE',
                changes: [
                    {
                        action: 'Add',
                        logicalId: 'VeryLongResourceNameThatExceedsNormalLengthForDisplayPurposes',
                        resourceType: 'AWS::Lambda::Function',
                    },
                ],
                summary: { add: 1, modify: 0, remove: 0, replace: 0 },
            });
            const reporter = new DryRunReporter();

            expect(() => reporter.report(report)).not.toThrow();
        });

        it('should handle reports with all sections empty', () => {
            const report = createBasicReport();
            const reporter = new DryRunReporter();

            const output = reporter.report(report);

            expect(output).toContain('App Configuration');
            expect(output).toContain('Dry-Run Summary');
        });
    });
});

// Helper functions to create test reports

function createBasicReport(overrides = {}) {
    return new DryRunReport({
        stackName: 'test-app-dev',
        region: 'us-east-1',
        stage: 'dev',
        status: DryRunStatus.success(),
        timestamp: new Date('2025-10-28T14:30:22Z'),
        ...overrides,
    });
}

function createSuccessfulReport() {
    const report = createBasicReport();

    // Environment validation
    report.setEnvironmentResult(
        ValidationResult.success({
            required: { present: ['AWS_REGION', 'STAGE', 'DB_URI'], missing: [] },
            optional: { present: ['SENTRY_DSN'], missing: [] },
        })
    );

    // Discovery results
    report.setDiscoveryResult({
        vpc: { id: 'vpc-12345678', cidr: '10.0.0.0/16' },
        subnets: ['subnet-11111111', 'subnet-22222222'],
        securityGroups: ['sg-12345678'],
        kmsKey: 'arn:aws:kms:us-east-1:123456789012:key/abc-123',
    });

    // Template generation
    report.setTemplateResult({
        service: 'my-integration-dev',
        functions: {
            count: 3,
            names: ['health', 'user', 'integration-hubspot'],
            details: [
                { name: 'health', memory: 256, timeout: 30 },
                { name: 'user', memory: 512, timeout: 30 },
                { name: 'integration-hubspot', memory: 1024, timeout: 60 },
            ],
        },
        endpoints: {
            count: 2,
            methods: ['GET /health', 'POST /api/integrations'],
        },
    });

    // Change set
    report.setChangeSetResult({
        stackName: 'test-app-dev',
        changeSetId: 'arn:aws:cloudformation:...',
        status: 'CREATE_COMPLETE',
        changes: [
            {
                action: 'Add',
                logicalId: 'HealthLambdaFunction',
                resourceType: 'AWS::Lambda::Function',
            },
        ],
        summary: { add: 1, modify: 0, remove: 0, replace: 0 },
    });

    // Impact
    report.setImpactResult({
        downtime: '2-3 minutes',
        functionsAffected: 12,
        coldStarts: true,
        breakingChanges: false,
    });

    return report;
}

function createReportWithWarnings() {
    const report = createBasicReport({
        status: DryRunStatus.withWarnings(),
    });

    report.setEnvironmentResult(
        ValidationResult.withWarnings(
            ['2 optional environment variables missing'],
            {
                required: { present: ['AWS_REGION', 'STAGE'], missing: [] },
                optional: { present: [], missing: ['SENTRY_DSN', 'NEW_RELIC_KEY'] },
            }
        )
    );

    report.setChangeSetResult({
        stackName: 'test-app-dev',
        changeSetId: 'arn:aws:cloudformation:...',
        status: 'CREATE_COMPLETE',
        changes: [],
        summary: { add: 0, modify: 0, remove: 0, replace: 0 },
    });

    return report;
}

function createReportWithErrors() {
    const report = createBasicReport({
        status: DryRunStatus.validationError(),
    });

    report.setEnvironmentResult(
        ValidationResult.failure(
            ['Missing required environment variables'],
            [],
            {
                required: { present: ['AWS_REGION'], missing: ['DB_URI', 'ENCRYPTION_KEY'] },
                optional: { present: [], missing: [] },
            }
        )
    );

    return report;
}
