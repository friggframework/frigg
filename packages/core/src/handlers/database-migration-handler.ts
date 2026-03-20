/**
 * Database Migration Handler for AWS Lambda
 *
 * Executes Prisma migrations in a Lambda environment.
 */
import { execFile } from 'node:child_process';
import path from 'node:path';

export interface MigrationEvent {
    command?: string;
}

export interface MigrationContext {
    functionName: string;
    functionVersion: string;
    memoryLimitInMB: string;
    logGroupName: string;
}

export interface MigrationResult {
    success: boolean;
    command: string;
    message?: string;
    error?: string;
    duration: string;
    timestamp: string;
}

async function executePrismaMigration(command: string, schemaPath: string): Promise<number> {
    console.log(`Executing Prisma migration: ${command}`);
    console.log(`Schema path: ${schemaPath}`);
    console.log(`Database URL: ${process.env.DATABASE_URL ? '[SET]' : '[NOT SET]'}`);

    return new Promise((resolve) => {
        const args = ['migrate', command];

        if (command === 'reset') {
            args.push('--force', '--skip-generate');
        }

        if (schemaPath) {
            args.push('--schema', schemaPath);
        }

        console.log(`Running: prisma ${args.join(' ')}`);

        execFile(
            path.resolve('./node_modules/prisma/build/index.js'),
            args,
            {
                env: {
                    ...process.env,
                    PRISMA_CLI_BINARY_TARGETS: 'rhel-openssl-3.0.x',
                }
            },
            (error, stdout, stderr) => {
                if (stdout) console.log('STDOUT:', stdout);
                if (stderr) console.error('STDERR:', stderr);

                if (error) {
                    console.error(`Migration ${command} exited with error:`, error.message);
                    console.error(`Exit code: ${error.code || 1}`);
                    resolve(typeof error.code === 'number' ? error.code : 1);
                } else {
                    console.log(`Migration ${command} completed successfully`);
                    resolve(0);
                }
            }
        );
    });
}

function validateCommand(command: string): void {
    const validCommands = ['deploy', 'reset'];

    if (!validCommands.includes(command)) {
        throw new Error(
            `Invalid migration command: "${command}". Valid commands are: ${validCommands.join(', ')}`
        );
    }

    if (command === 'reset') {
        const stage = process.env.STAGE || process.env.NODE_ENV;
        if (stage === 'production' || stage === 'prod') {
            throw new Error(
                'BLOCKED: "reset" command is not allowed in production environment.'
            );
        }
        console.warn('⚠️  WARNING: "reset" will DELETE all data and reset the database!');
    }
}

function getSchemaPath(): string {
    const baseSchemaPath = './node_modules/@friggframework/core/generated';

    if (process.env.DATABASE_URL?.includes('postgresql') || process.env.DATABASE_URL?.includes('postgres')) {
        const schemaPath = `${baseSchemaPath}/prisma-postgresql/schema.prisma`;
        console.log(`Using PostgreSQL schema: ${schemaPath}`);
        return schemaPath;
    }

    if (process.env.DATABASE_URL?.includes('mongodb')) {
        const schemaPath = `${baseSchemaPath}/prisma-mongodb/schema.prisma`;
        console.log(`Using MongoDB schema: ${schemaPath}`);
        return schemaPath;
    }

    console.log('DATABASE_URL not set or database type unknown, defaulting to PostgreSQL');
    return `${baseSchemaPath}/prisma-postgresql/schema.prisma`;
}



export const handler = async (event: MigrationEvent, context: MigrationContext): Promise<MigrationResult> => {
    const startTime = Date.now();

    console.log('='.repeat(60));
    console.log('Database Migration Handler');
    console.log('='.repeat(60));
    console.log('Event:', JSON.stringify(event, null, 2));
    console.log('Context:', JSON.stringify({
        functionName: context.functionName,
        functionVersion: context.functionVersion,
        memoryLimitInMB: context.memoryLimitInMB,
        logGroupName: context.logGroupName,
    }, null, 2));

    try {
        const command = event.command || 'deploy';
        validateCommand(command);

        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is not set.');
        }

        const schemaPath = getSchemaPath();
        const exitCode = await executePrismaMigration(command, schemaPath);
        const duration = Date.now() - startTime;

        if (exitCode === 0) {
            const result: MigrationResult = {
                success: true,
                command,
                message: `Migration ${command} completed successfully`,
                duration: `${duration}ms`,
                timestamp: new Date().toISOString(),
            };
            console.log('='.repeat(60));
            console.log('Migration completed successfully');
            console.log(JSON.stringify(result, null, 2));
            console.log('='.repeat(60));
            return result;
        } else {
            throw new Error(`Migration ${command} failed with exit code ${exitCode}`);
        }
    } catch (error: any) {
        const duration = Date.now() - startTime;
        console.error('='.repeat(60));
        console.error('Migration failed');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(60));

        return {
            success: false,
            command: event.command || 'unknown',
            error: error.message,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
        };
    }
};