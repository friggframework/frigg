/**
 * Get Database State Via Worker Use Case
 *
 * Domain logic for getting database state by invoking the worker Lambda.
 * This use case delegates to the worker Lambda which has Prisma CLI installed,
 * keeping the router Lambda lightweight.
 *
 * Architecture: Hexagonal/Clean
 * - Use Case (Domain Layer)
 * - Depends on LambdaInvoker (Infrastructure abstraction)
 * - Called by Router (Adapter Layer)
 */

/**
 * Domain Use Case: Get database state by invoking worker Lambda
 *
 * This use case delegates database state checking to the worker Lambda,
 * which has Prisma CLI installed. Keeps the router Lambda lightweight.
 */
class GetDatabaseStateViaWorkerUseCase {
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
     * Execute database state check via worker Lambda
     *
     * @param {string} stage - Deployment stage (prod, dev, etc)
     * @returns {Promise<Object>} Database state result
     */
    async execute(stage = 'production') {
        const dbType = process.env.DB_TYPE || 'postgresql';

        console.log(
            `Invoking worker Lambda to check database state: ${this.workerFunctionName}`
        );

        // Invoke worker Lambda with checkStatus action
        const result = await this.lambdaInvoker.invoke(
            this.workerFunctionName,
            {
                action: 'checkStatus',
                dbType,
                stage,
            }
        );

        return result;
    }
}

module.exports = { GetDatabaseStateViaWorkerUseCase };
