const { DryRunReport } = require('../../domain/entities/DryRunReport');
const { DryRunStatus } = require('../../domain/value-objects/DryRunStatus');
const { ValidationResult } = require('../../domain/value-objects/ValidationResult');

class ExecuteDryRunUseCase {
    constructor({
        preFlightChecker,
        environmentValidator,
        templateGenerator,
        changeSetCreator,
        changeSetAnalyzer,
    }) {
        if (!preFlightChecker) {
            throw new Error('preFlightChecker is required');
        }
        if (!environmentValidator) {
            throw new Error('environmentValidator is required');
        }
        if (!templateGenerator) {
            throw new Error('templateGenerator is required');
        }
        if (!changeSetCreator) {
            throw new Error('changeSetCreator is required');
        }
        if (!changeSetAnalyzer) {
            throw new Error('changeSetAnalyzer is required');
        }

        this.preFlightChecker = preFlightChecker;
        this.environmentValidator = environmentValidator;
        this.templateGenerator = templateGenerator;
        this.changeSetCreator = changeSetCreator;
        this.changeSetAnalyzer = changeSetAnalyzer;
    }

    /**
     * Executes the dry-run workflow
     *
     * @param {Object} params - Execution parameters
     * @param {string} params.appPath - Path to application directory
     * @param {string} params.stackName - CloudFormation stack name
     * @param {string} params.region - AWS region
     * @param {string} params.stage - Deployment stage
     * @param {Object} params.options - Additional options
     * @returns {Promise<DryRunReport>} Complete dry-run report
     */
    async execute({ appPath, stackName, region, stage, options = {} }) {
        if (!appPath) {
            throw new Error('appPath is required');
        }
        if (!stackName) {
            throw new Error('stackName is required');
        }
        if (!region) {
            throw new Error('region is required');
        }
        if (!stage) {
            throw new Error('stage is required');
        }

        let finalStatus = DryRunStatus.success();
        let hasWarnings = false;
        let hasErrors = false;
        const report = new DryRunReport({
            stackName,
            region,
            stage,
            timestamp: new Date(),
            status: finalStatus,
        });

        try {
            const preFlightResult = await this._executePreFlightChecks(appPath);
            report.setPreFlightResult(preFlightResult);

            if (preFlightResult.hasErrors()) {
                hasErrors = true;
                finalStatus = DryRunStatus.validationError(
                    'Pre-flight checks failed'
                );
                report.status = finalStatus;
                return report;
            }

            if (preFlightResult.hasWarnings()) {
                hasWarnings = true;
            }

            const environmentResult = await this._executeEnvironmentValidation(region);
            report.setEnvironmentResult(environmentResult);

            if (environmentResult.hasErrors()) {
                hasErrors = true;
                finalStatus = DryRunStatus.validationError(
                    'Environment validation failed'
                );
                report.status = finalStatus;
                return report;
            }

            if (environmentResult.hasWarnings()) {
                hasWarnings = true;
            }

            const templateResult = await this._executeTemplateGeneration({
                appPath,
                stage,
                region,
                preFlightMetadata: preFlightResult.metadata,
                options,
            });

            if (templateResult.error) {
                hasErrors = true;
                finalStatus = DryRunStatus.validationError(
                    'Template generation failed'
                );
                report.setTemplateResult(templateResult);
                report.status = finalStatus;
                return report;
            }

            report.setTemplateResult(templateResult);

            const changeSetResult = await this._executeChangeSetCreation({
                stackName,
                region,
                template: templateResult.template,
                stage,
            });

            if (changeSetResult.error) {
                hasErrors = true;
                finalStatus = DryRunStatus.validationError(
                    'Change set creation failed'
                );
                report.setChangeSetResult(changeSetResult);
                report.status = finalStatus;
                return report;
            }

            report.setChangeSetResult(changeSetResult);

            const impactResult = this._executeChangeSetAnalysis(changeSetResult.details);
            report.setImpactResult(impactResult);

            if (hasErrors) {
                finalStatus = DryRunStatus.validationError('Dry-run completed with errors');
            } else if (hasWarnings) {
                finalStatus = DryRunStatus.withWarnings('Dry-run completed with warnings');
            } else {
                finalStatus = DryRunStatus.success('Dry-run completed successfully');
            }

            report.status = finalStatus;
            return report;
        } catch (error) {
            finalStatus = DryRunStatus.validationError(
                `Dry-run failed: ${error.message}`
            );
            report.status = finalStatus;
            return report;
        }
    }

    async _executePreFlightChecks(appPath) {
        try {
            return await this.preFlightChecker.check(appPath);
        } catch (error) {
            return ValidationResult.failure([`Pre-flight check error: ${error.message}`]);
        }
    }

    async _executeEnvironmentValidation(region) {
        try {
            const envVarsResult = await this.environmentValidator.validateEnvironmentVariables();
            const awsCredsResult = await this.environmentValidator.validateAwsCredentials(region);

            const errors = [...envVarsResult.errors, ...awsCredsResult.errors];
            const warnings = [...envVarsResult.warnings, ...awsCredsResult.warnings];

            const metadata = {
                environmentVariables: envVarsResult.metadata,
                awsCredentials: awsCredsResult.metadata,
            };

            if (errors.length > 0) {
                return ValidationResult.failure(errors, warnings, metadata);
            }

            if (warnings.length > 0) {
                return ValidationResult.withWarnings(warnings, metadata);
            }

            return ValidationResult.success(metadata);
        } catch (error) {
            return ValidationResult.failure([`Environment validation error: ${error.message}`]);
        }
    }

    async _executeTemplateGeneration({ appPath, stage, region, preFlightMetadata, options }) {
        try {
            const result = await this.templateGenerator.generateTemplate({
                appPath,
                stage,
                region,
                appDefinition: preFlightMetadata?.appDefinition,
                options,
            });

            return result;
        } catch (error) {
            return {
                error: error.message,
            };
        }
    }

    async _executeChangeSetCreation({ stackName, region, template, stage }) {
        try {
            const stackExists = await this.changeSetCreator.stackExists(stackName, region);

            const changeSetId = await this.changeSetCreator.createChangeSet({
                stackName,
                template,
                region,
                parameters: {
                    Stage: stage,
                },
                changeSetType: stackExists ? 'UPDATE' : 'CREATE',
            });

            await this.changeSetCreator.waitForChangeSet(changeSetId);

            const changeSetDetails = await this.changeSetCreator.getChangeSetDetails(changeSetId);

            await this.changeSetCreator.deleteChangeSet(changeSetId);

            return {
                id: changeSetId,
                details: changeSetDetails,
                stackExists,
            };
        } catch (error) {
            return {
                error: error.message,
            };
        }
    }

    _executeChangeSetAnalysis(changeSetDetails) {
        try {
            const analysis = this.changeSetAnalyzer.analyzeChangeSet(changeSetDetails);

            return analysis;
        } catch (error) {
            return {
                error: error.message,
                summary: null,
                criticalChanges: [],
                warnings: [],
                impact: null,
            };
        }
    }
}

module.exports = { ExecuteDryRunUseCase };
