import type { LambdaInvoker } from '../adapters/lambda-invoker';

export class GetDatabaseStateViaWorkerUseCase {
    private readonly lambdaInvoker: LambdaInvoker;
    private readonly workerFunctionName: string;

    constructor({ lambdaInvoker, workerFunctionName }: { lambdaInvoker: LambdaInvoker; workerFunctionName: string }) {
        if (!lambdaInvoker) {
            throw new Error('lambdaInvoker dependency is required');
        }
        if (!workerFunctionName) {
            throw new Error('workerFunctionName is required');
        }
        this.lambdaInvoker = lambdaInvoker;
        this.workerFunctionName = workerFunctionName;
    }

    async execute(stage: string = 'production'): Promise<unknown> {
        const dbType = process.env.DB_TYPE || 'postgresql';

        console.log(`Invoking worker Lambda to check database state: ${this.workerFunctionName}`);

        const result = await this.lambdaInvoker.invoke(this.workerFunctionName, {
            action: 'checkStatus',
            dbType,
            stage,
        });

        return result;
    }
}
