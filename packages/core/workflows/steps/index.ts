const { WorkflowStep } = require('./workflow-step');
const { FunctionStep } = require('./function-step');
const { FanOutStep } = require('./fan-out-step');

/**
 * Step Factory for creating step instances from configuration
 */
class StepFactory {
    static createStep(config) {
        switch (config.type) {
            case 'FUNCTION':
                return FunctionStep.fromConfig(config);
            case 'FAN_OUT':
                return FanOutStep.fromConfig(config);
            default:
                throw new Error(`Unknown step type: ${config.type}`);
        }
    }

    static getSupportedTypes() {
        return ['FUNCTION', 'FAN_OUT'];
    }
}

module.exports = {
    WorkflowStep,
    FunctionStep,
    FanOutStep,
    StepFactory
};