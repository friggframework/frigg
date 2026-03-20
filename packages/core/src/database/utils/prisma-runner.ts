import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

function normalizeMongoCompatible(dbType: string): string {
    return dbType === 'documentdb' ? 'mongodb' : dbType;
}

export function getPrismaSchemaPath(dbType: string, projectRoot: string = process.cwd()): string {
    const normalizedType = normalizeMongoCompatible(dbType);
    const possiblePaths = [
        `/opt/nodejs/node_modules/generated/prisma-${normalizedType}/schema.prisma`,
        path.join(projectRoot, 'node_modules', '@friggframework', 'core', `prisma-${normalizedType}`, 'schema.prisma'),
        path.join(projectRoot, '..', 'node_modules', '@friggframework', 'core', `prisma-${normalizedType}`, 'schema.prisma'),
    ];

    for (const schemaPath of possiblePaths) {
        if (fs.existsSync(schemaPath)) {
            return schemaPath;
        }
    }

    throw new Error(
        `Prisma schema not found at:\n${possiblePaths.join('\n')}\n\n` +
        'Ensure @friggframework/core is installed.'
    );
}

interface CommandResult {
    success: boolean;
    output?: string;
    error?: string;
}

export async function runPrismaGenerate(dbType: string, verbose: boolean = false): Promise<CommandResult> {
    try {
        const schemaPath = getPrismaSchemaPath(dbType);

        const normalizedType = normalizeMongoCompatible(dbType);
        const generatedClientPath = path.join(path.dirname(path.dirname(schemaPath)), 'generated', `prisma-${normalizedType}`, 'client.js');
        const isLambdaEnvironment = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.LAMBDA_TASK_ROOT;

        const lambdaLayerClientPath = `/opt/nodejs/node_modules/generated/prisma-${normalizedType}/client.js`;

        const clientExists = fs.existsSync(generatedClientPath) || (isLambdaEnvironment && fs.existsSync(lambdaLayerClientPath));

        if (clientExists) {
            if (isLambdaEnvironment) {
                return {
                    success: true,
                    output: 'Using pre-generated Prisma client (Lambda environment)',
                };
            }
        }

        if (verbose) {
            console.log(`Running: npx prisma generate --schema=${schemaPath}`);
        }

        const output = execSync(
            `npx prisma generate --schema=${schemaPath}`,
            {
                encoding: 'utf8',
                stdio: verbose ? 'inherit' : 'pipe',
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1',
                },
            }
        );

        return {
            success: true,
            output: verbose ? 'Generated successfully' : output as string,
        };
    } catch (error: unknown) {
        const err = error as Error & { stdout?: Buffer; stderr?: Buffer };
        return {
            success: false,
            error: err.message,
            output: err.stdout?.toString() || err.stderr?.toString(),
        };
    }
}

export async function checkDatabaseState(dbType: string): Promise<{ upToDate: boolean; pendingMigrations?: number; error?: string }> {
    try {
        if (dbType !== 'postgresql') {
            return { upToDate: true };
        }

        const schemaPath = getPrismaSchemaPath(dbType);
        const prismaBin = getPrismaBinaryPath();

        const isDirectBinary = prismaBin !== 'npx prisma';
        const command = isDirectBinary
            ? `${prismaBin} migrate status --schema=${schemaPath}`
            : `npx prisma migrate status --schema=${schemaPath}`;

        const output = execSync(
            command,
            {
                encoding: 'utf8',
                stdio: 'pipe',
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1',
                },
            }
        );

        if (output.includes('Database schema is up to date')) {
            return { upToDate: true };
        }

        const pendingMatch = /(\d+) migration/.exec(output);
        const pendingMigrations = pendingMatch ? Number.parseInt(pendingMatch[1]) : 0;

        return {
            upToDate: false,
            pendingMigrations,
        };
    } catch (error) {
        return {
            upToDate: false,
            error: (error as Error).message,
        };
    }
}

export function getPrismaBinaryPath(): string {
    const functionPrisma = '/var/task/node_modules/prisma/build/index.js';
    if (fs.existsSync(functionPrisma)) {
        return `node ${functionPrisma}`;
    }

    const layerPrisma = '/opt/nodejs/node_modules/prisma/build/index.js';
    if (fs.existsSync(layerPrisma)) {
        return `node ${layerPrisma}`;
    }

    const localPrisma = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
    if (fs.existsSync(localPrisma)) {
        return `node ${localPrisma}`;
    }

    return 'npx prisma';
}

export async function runPrismaMigrate(command: string = 'dev', verbose: boolean = false): Promise<CommandResult> {
    return new Promise((resolve) => {
        try {
            const schemaPath = getPrismaSchemaPath('postgresql');
            const prismaBin = getPrismaBinaryPath();

            const isDirectBinary = prismaBin !== 'npx';
            const args = isDirectBinary
                ? ['migrate', command, '--schema', schemaPath]
                : ['prisma', 'migrate', command, '--schema', schemaPath];

            if (verbose) {
                const displayCmd = isDirectBinary
                    ? `${prismaBin} ${args.join(' ')}`
                    : `npx ${args.join(' ')}`;
                console.log(`Running: ${displayCmd}`);
            }

            const [executable, ...executableArgs] = prismaBin.split(' ');
            const fullArgs = [...executableArgs, ...args];

            const proc = spawn(executable, fullArgs, {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1',
                },
            });

            proc.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output: 'Migration completed successfully' });
                } else {
                    resolve({ success: false, error: `Migration process exited with code ${code}` });
                }
            });
        } catch (error) {
            resolve({ success: false, error: (error as Error).message });
        }
    });
}

export async function runPrismaDbPush(verbose: boolean = false, nonInteractive: boolean = false): Promise<CommandResult> {
    return new Promise((resolve) => {
        try {
            const schemaPath = getPrismaSchemaPath('mongodb');

            const args = [
                'prisma',
                'db',
                'push',
                '--schema',
                schemaPath,
                '--skip-generate',
            ];

            if (nonInteractive) {
                args.push('--accept-data-loss');
            }

            if (verbose) {
                console.log(`Running: npx ${args.join(' ')}`);
            }

            const proc = spawn('npx', args, {
                stdio: nonInteractive ? 'pipe' : 'inherit',
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1',
                },
            });

            let stdout = '';
            let stderr = '';

            if (nonInteractive) {
                if (proc.stdout) {
                    proc.stdout.on('data', (data: Buffer) => {
                        stdout += data.toString();
                        if (verbose) {
                            process.stdout.write(data);
                        }
                    });
                }
                if (proc.stderr) {
                    proc.stderr.on('data', (data: Buffer) => {
                        stderr += data.toString();
                        if (verbose) {
                            process.stderr.write(data);
                        }
                    });
                }
            }

            proc.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        output: nonInteractive ? stdout || 'Database push completed successfully' : 'Database push completed successfully',
                    });
                } else {
                    resolve({
                        success: false,
                        error: `Database push process exited with code ${code}`,
                        output: stderr || stdout,
                    });
                }
            });
        } catch (error) {
            resolve({ success: false, error: (error as Error).message });
        }
    });
}

export async function runPrismaMigrateResolve(
    migrationName: string,
    action: 'applied' | 'rolled-back' = 'applied',
    verbose: boolean = false
): Promise<CommandResult> {
    return new Promise((resolve) => {
        try {
            const schemaPath = getPrismaSchemaPath('postgresql');
            const prismaBin = getPrismaBinaryPath();

            const isDirectBinary = prismaBin !== 'npx prisma';
            const args = isDirectBinary
                ? ['migrate', 'resolve', `--${action}`, migrationName, '--schema', schemaPath]
                : ['prisma', 'migrate', 'resolve', `--${action}`, migrationName, '--schema', schemaPath];

            if (verbose) {
                const displayCmd = isDirectBinary
                    ? `${prismaBin} ${args.join(' ')}`
                    : `npx ${args.join(' ')}`;
                console.log(`Running: ${displayCmd}`);
            }

            const [executable, ...executableArgs] = prismaBin.split(' ');
            const fullArgs = [...executableArgs, ...args];

            const proc = spawn(executable, fullArgs, {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1',
                },
            });

            proc.on('error', (error) => {
                resolve({ success: false, error: error.message });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({ success: true, output: `Migration ${migrationName} marked as ${action}` });
                } else {
                    resolve({ success: false, error: `Resolve process exited with code ${code}` });
                }
            });
        } catch (error) {
            resolve({ success: false, error: (error as Error).message });
        }
    });
}

export function getMigrationCommand(stage?: string): 'dev' | 'deploy' {
    const isLambdaEnvironment = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.LAMBDA_TASK_ROOT;
    if (isLambdaEnvironment) {
        return 'deploy';
    }

    const normalizedStage = (stage || process.env.STAGE || 'development').toLowerCase();
    const developmentStages = ['dev', 'local', 'test', 'development'];

    if (developmentStages.includes(normalizedStage)) {
        return 'dev';
    }

    return 'deploy';
}
