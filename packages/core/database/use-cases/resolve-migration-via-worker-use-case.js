/**
 * Resolve Migration Via Worker Use Case
 *
 * Resolves a failed Prisma migration (P3009) by invoking the worker Lambda,
 * which has the Prisma CLI installed. Keeps the router Lambda lightweight —
 * same delegation pattern as GetDatabaseStateViaWorkerUseCase.
 */
class ResolveMigrationViaWorkerUseCase {
    /**
     * @param {Object} dependencies
     * @param {LambdaInvoker} dependencies.lambdaInvoker - Lambda invocation adapter
     * @param {string} dependencies.workerFunctionName - Worker Lambda function name
     */
    constructor({ lambdaInvoker, workerFunctionName }) {
        if (!lambdaInvoker) {
            throw new Error('lambdaInvoker dependency is required');
        }
        if (!workerFunctionName) {
            throw new Error('workerFunctionName is required');
        }
        this.lambdaInvoker = lambdaInvoker;
        this.workerFunctionName = workerFunctionName;
    }

    /**
     * @param {Object} params
     * @param {string} params.migrationName - Migration to resolve
     * @param {'applied'|'rolled-back'} [params.action] - Resolution mode
     * @param {string} [params.stage] - Deployment stage
     * @returns {Promise<Object>} Worker result body
     */
    async execute({ migrationName, action = 'applied', stage }) {
        const dbType = process.env.DB_TYPE || 'postgresql';

        console.log(
            `Invoking worker Lambda to resolve migration "${migrationName}" as ${action}: ${this.workerFunctionName}`
        );

        return this.lambdaInvoker.invoke(this.workerFunctionName, {
            action: 'resolve',
            migrationName,
            resolveAction: action,
            dbType,
            stage,
        });
    }
}

module.exports = { ResolveMigrationViaWorkerUseCase };
