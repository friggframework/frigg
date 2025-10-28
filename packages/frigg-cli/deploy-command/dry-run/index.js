const { PreFlightChecker } = require('./domain/services/PreFlightChecker');
const { ChangeSetAnalyzer } = require('./domain/services/ChangeSetAnalyzer');
const { ExecuteDryRunUseCase } = require('./application/use-cases');
const { CloudFormationChangeSetCreator } = require('./infrastructure/adapters/CloudFormationChangeSetCreator');
const { EnvironmentValidator } = require('./infrastructure/adapters/EnvironmentValidator');
const { ServerlessTemplateGenerator } = require('./infrastructure/adapters/ServerlessTemplateGenerator');
const { DryRunReporter } = require('./infrastructure/adapters/DryRunReporter');
const { FileSystemAdapter } = require('./infrastructure/adapters/FileSystemAdapter');

async function executeDryRun({ appPath, stackName, region, stage, options = {} }) {
    const fileSystem = new FileSystemAdapter();
    const preFlightChecker = new PreFlightChecker({ fileSystem });
    const environmentValidator = new EnvironmentValidator({ region });
    const changeSetCreator = new CloudFormationChangeSetCreator({ region });
    const changeSetAnalyzer = new ChangeSetAnalyzer();

    let templateGenerator;
    try {
        const { InfrastructureComposer } = require('@friggframework/devtools/infrastructure');
        const composer = new InfrastructureComposer();
        templateGenerator = new ServerlessTemplateGenerator({
            infrastructureComposer: composer,
        });
    } catch (error) {
        throw new Error(
            `Failed to load infrastructure composer: ${error.message}\n` +
            'Make sure @friggframework/devtools is installed and properly configured.'
        );
    }

    const useCase = new ExecuteDryRunUseCase({
        preFlightChecker,
        environmentValidator,
        templateGenerator,
        changeSetCreator,
        changeSetAnalyzer,
    });

    const report = await useCase.execute({
        appPath,
        stackName,
        region,
        stage,
        options,
    });

    const reporter = new DryRunReporter({ format: options.output || 'console' });
    reporter.display(report);

    return report;
}

module.exports = {
    executeDryRun,
    ExecuteDryRunUseCase,
    PreFlightChecker,
    ChangeSetAnalyzer,
    CloudFormationChangeSetCreator,
    EnvironmentValidator,
    ServerlessTemplateGenerator,
    DryRunReporter,
    FileSystemAdapter,
};
