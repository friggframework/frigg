const { DryRunStatus } = require('../value-objects/DryRunStatus');
const { ChangeSetSummary } = require('../value-objects/ChangeSetSummary');
const { ValidationResult } = require('../value-objects/ValidationResult');

class DryRunReport {
    constructor({
        stackName,
        region,
        stage,
        timestamp = new Date(),
        status,
        preFlight = null,
        environment = null,
        discovery = null,
        template = null,
        changeSet = null,
        impact = null,
    }) {
        if (!stackName) throw new Error('stackName is required');
        if (!region) throw new Error('region is required');
        if (!stage) throw new Error('stage is required');
        if (!(status instanceof DryRunStatus)) {
            throw new Error('status must be a DryRunStatus instance');
        }

        this.stackName = stackName;
        this.region = region;
        this.stage = stage;
        this.timestamp = timestamp;
        this.status = status;
        this.preFlight = preFlight;
        this.environment = environment;
        this.discovery = discovery;
        this.template = template;
        this.changeSet = changeSet;
        this.impact = impact;
    }

    setPreFlightResult(result) {
        this.preFlight = result;
    }

    setEnvironmentResult(result) {
        if (!(result instanceof ValidationResult)) {
            throw new Error('result must be a ValidationResult instance');
        }
        this.environment = result;
    }

    setDiscoveryResult(result) {
        this.discovery = result;
    }

    setTemplateResult(result) {
        this.template = result;
    }

    setChangeSetResult(result) {
        this.changeSet = result;
    }

    setImpactResult(result) {
        this.impact = result;
    }

    hasErrors() {
        return (
            this.status.hasErrors() ||
            (this.environment && this.environment.hasErrors())
        );
    }

    hasWarnings() {
        return (
            this.status.hasWarnings() ||
            (this.environment && this.environment.hasWarnings())
        );
    }

    getExitCode() {
        return this.status.code;
    }

    toObject() {
        return {
            dryRun: true,
            timestamp: this.timestamp.toISOString(),
            stackName: this.stackName,
            region: this.region,
            stage: this.stage,
            status: this.status.toObject(),
            preFlight: this.preFlight,
            environment: this.environment ? this.environment.toObject() : null,
            discovery: this.discovery,
            template: this.template,
            changeSet: this.changeSet,
            impact: this.impact,
            exitCode: this.getExitCode(),
        };
    }
}

module.exports = { DryRunReport };
