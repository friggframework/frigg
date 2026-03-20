import { HealthCheckRepositoryInterface } from '../repositories/health-check-repository-interface';

export interface DatabaseHealthResult {
    status: 'healthy' | 'unhealthy';
    state: string;
    responseTime?: number;
}

export class CheckDatabaseHealthUseCase {
    private readonly repository: HealthCheckRepositoryInterface;

    constructor({ healthCheckRepository }: { healthCheckRepository: HealthCheckRepositoryInterface }) {
        this.repository = healthCheckRepository;
    }

    async execute(): Promise<DatabaseHealthResult> {
        const { stateName, isConnected } = await this.repository.getDatabaseConnectionState();

        const result: DatabaseHealthResult = {
            status: isConnected ? 'healthy' : 'unhealthy',
            state: stateName,
        };

        if (isConnected) {
            result.responseTime = await this.repository.pingDatabase(2000);
        }

        return result;
    }
}
