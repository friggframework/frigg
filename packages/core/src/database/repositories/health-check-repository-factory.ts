import { HealthCheckRepositoryMongoDB } from './health-check-repository-mongodb';
import { HealthCheckRepositoryPostgreSQL } from './health-check-repository-postgres';
import { HealthCheckRepositoryDocumentDB } from './health-check-repository-documentdb';
import { HealthCheckRepositoryInterface } from './health-check-repository-interface';
import config from '../config';
import type { PrismaClientLike } from '../prisma';

interface CreateHealthCheckRepositoryOptions {
    prismaClient: PrismaClientLike;
}

export function createHealthCheckRepository({ prismaClient }: CreateHealthCheckRepositoryOptions): HealthCheckRepositoryInterface {
    if (!prismaClient) {
        throw new Error('prismaClient is required');
    }

    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new HealthCheckRepositoryMongoDB({ prismaClient });

        case 'postgresql':
            return new HealthCheckRepositoryPostgreSQL({ prismaClient });

        case 'documentdb':
            return new HealthCheckRepositoryDocumentDB({ prismaClient });

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

export { HealthCheckRepositoryMongoDB } from './health-check-repository-mongodb';
export { HealthCheckRepositoryPostgreSQL } from './health-check-repository-postgres';
export { HealthCheckRepositoryDocumentDB } from './health-check-repository-documentdb';
