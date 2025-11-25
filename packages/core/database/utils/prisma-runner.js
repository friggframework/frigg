const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');

/**
 * Prisma Command Runner Utility
 * Handles execution of Prisma CLI commands for database setup
 */

/**
 * Gets the path to the Prisma schema file for the database type
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to schema file
 * @throws {Error} If schema file doesn't exist
 */
function normalizeMongoCompatible(dbType) {
    return dbType === 'documentdb' ? 'mongodb' : dbType;
}

function getPrismaSchemaPath(dbType, projectRoot = process.cwd()) {
    const normalizedType = normalizeMongoCompatible(dbType);
    // Try multiple locations for the schema file
    // Priority order:
    // 1. Lambda layer path (where the schema actually exists in deployed Lambda)
    // 2. Local node_modules (where @friggframework/core is installed - production scenario)
    // 3. Parent node_modules (workspace/monorepo setup)
    const possiblePaths = [
        // Lambda layer path - this is where the schema actually exists in deployed Lambda
        `/opt/nodejs/node_modules/generated/prisma-${normalizedType}/schema.prisma`,
        // Check where Frigg is installed via npm (production scenario)
        path.join(projectRoot, 'node_modules', '@friggframework', 'core', `prisma-${normalizedType}`, 'schema.prisma'),
        path.join(projectRoot, '..', 'node_modules', '@friggframework', 'core', `prisma-${normalizedType}`, 'schema.prisma')
    ];

    for (const schemaPath of possiblePaths) {
        if (fs.existsSync(schemaPath)) {
            return schemaPath;
        }
    }

    // If not found in any location, throw error
    throw new Error(
        `Prisma schema not found at:\n${possiblePaths.join('\n')}\n\n` +
        'Ensure @friggframework/core is installed.'
    );
}

/**
 * Runs prisma generate for the specified database type
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @param {boolean} verbose - Enable verbose output
 * @returns {Promise<Object>} { success: boolean, output?: string, error?: string }
 */
async function runPrismaGenerate(dbType, verbose = false) {
    try {
        const schemaPath = getPrismaSchemaPath(dbType);

        // Check if Prisma client already exists (e.g., in Lambda or pre-generated)
        const normalizedType = normalizeMongoCompatible(dbType);
        const generatedClientPath = path.join(path.dirname(path.dirname(schemaPath)), 'generated', `prisma-${normalizedType}`, 'client.js');
        const isLambdaEnvironment = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.LAMBDA_TASK_ROOT;

        // In Lambda, also check the layer path (/opt/nodejs/node_modules)
        const lambdaLayerClientPath = `/opt/nodejs/node_modules/generated/prisma-${normalizedType}/client.js`;

        const clientExists = fs.existsSync(generatedClientPath) || (isLambdaEnvironment && fs.existsSync(lambdaLayerClientPath));

        if (clientExists) {
            const foundPath = fs.existsSync(generatedClientPath) ? generatedClientPath : lambdaLayerClientPath;
            if (verbose) {
            console.log(chalk.gray(`✓ Prisma client already generated at: ${foundPath}`));
            }
            if (isLambdaEnvironment) {
                if (verbose) {
                    console.log(chalk.gray('Skipping generation in Lambda environment (using pre-generated client)'));
                }
                return {
                    success: true,
                    output: 'Using pre-generated Prisma client (Lambda environment)'
                };
            }
        }

        if (verbose) {
            console.log(chalk.gray(`Running: npx prisma generate --schema=${schemaPath}`));
        }

        const output = execSync(
            `npx prisma generate --schema=${schemaPath}`,
            {
                encoding: 'utf8',
                stdio: verbose ? 'inherit' : 'pipe',
                env: {
                    ...process.env,
                    // Suppress Prisma telemetry prompts
                    PRISMA_HIDE_UPDATE_MESSAGE: '1'
                }
            }
        );

        return {
            success: true,
            output: verbose ? 'Generated successfully' : output
        };

    } catch (error) {
        return {
            success: false,
            error: error.message,
            output: error.stdout?.toString() || error.stderr?.toString()
        };
    }
}

/**
 * Checks database migration status
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @returns {Promise<Object>} { upToDate: boolean, pendingMigrations?: number, error?: string }
 */
async function checkDatabaseState(dbType) {
    try {
        // Only applicable for PostgreSQL (MongoDB uses db push)
        if (dbType !== 'postgresql') {
            return { upToDate: true };
        }

        const schemaPath = getPrismaSchemaPath(dbType);
        const prismaBin = getPrismaBinaryPath();

        // Use direct path instead of npx to avoid WASM file resolution issues
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
                    PRISMA_HIDE_UPDATE_MESSAGE: '1'
                }
            }
        );

        if (output.includes('Database schema is up to date')) {
            return { upToDate: true };
        }

        // Parse pending migrations count
        const pendingMatch = output.match(/(\d+) migration/);
        const pendingMigrations = pendingMatch ? parseInt(pendingMatch[1]) : 0;

        return {
            upToDate: false,
            pendingMigrations
        };

    } catch (error) {
        // If migrate status fails, database might not be initialized
        return {
            upToDate: false,
            error: error.message
        };
    }
}

/**
 * Gets the path to the Prisma CLI entry point
 * 
 * IMPORTANT: We invoke prisma/build/index.js directly instead of .bin/prisma
 * because .bin/prisma uses __dirname to find WASM files, and when the symlink
 * is resolved during Lambda packaging, __dirname points to .bin/ instead of
 * prisma/build/, causing WASM files to not be found.
 * 
 * @returns {string} Command to run Prisma CLI (e.g., 'node /path/to/index.js' or 'npx prisma')
 */
function getPrismaBinaryPath() {
    const fs = require('fs');

    // Check function's bundled Prisma (Lambda) - use actual CLI location
    const functionPrisma = '/var/task/node_modules/prisma/build/index.js';
    if (fs.existsSync(functionPrisma)) {
        return `node ${functionPrisma}`;
    }

    // Check Lambda layer path - use actual CLI location
    const layerPrisma = '/opt/nodejs/node_modules/prisma/build/index.js';
    if (fs.existsSync(layerPrisma)) {
        return `node ${layerPrisma}`;
    }

    // Check local node_modules - use actual CLI location
    const localPrisma = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
    if (fs.existsSync(localPrisma)) {
        return `node ${localPrisma}`;
    }

    // Fallback to npx (local dev)
    return 'npx prisma';
}

/**
 * Runs Prisma migrate for PostgreSQL
 * @param {'dev'|'deploy'} command - Migration command (dev or deploy)
 * @param {boolean} verbose - Enable verbose output
 * @returns {Promise<Object>} { success: boolean, output?: string, error?: string }
 */
async function runPrismaMigrate(command = 'dev', verbose = false) {
    return new Promise((resolve) => {
        try {
            const schemaPath = getPrismaSchemaPath('postgresql');

            // Get Prisma binary path (checks multiple locations)
            const isLambdaEnvironment = !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.LAMBDA_TASK_ROOT;
            const prismaBin = getPrismaBinaryPath();

            // Determine args based on whether we're using direct binary or npx
            // Direct binary (e.g., /var/task/node_modules/.bin/prisma): ['migrate', command, ...]
            // npx (local dev or fallback): ['prisma', 'migrate', command, ...]
            const isDirectBinary = prismaBin !== 'npx';
            const args = isDirectBinary
                ? ['migrate', command, '--schema', schemaPath]
                : ['prisma', 'migrate', command, '--schema', schemaPath];

            if (verbose) {
                const displayCmd = isDirectBinary
                    ? `${prismaBin} ${args.join(' ')}`
                    : `npx ${args.join(' ')}`;
                console.log(chalk.gray(`Running: ${displayCmd}`));
            }

            // Execute the command (prismaBin might be 'node /path/to/index.js' or 'npx prisma')
            const [executable, ...executableArgs] = prismaBin.split(' ');
            const fullArgs = [...executableArgs, ...args];

            const proc = spawn(executable, fullArgs, {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1'
                }
            });

            proc.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        output: 'Migration completed successfully'
                    });
                } else {
                    resolve({
                        success: false,
                        error: `Migration process exited with code ${code}`
                    });
                }
            });

        } catch (error) {
            resolve({
                success: false,
                error: error.message
            });
        }
    });
}

/**
 * Runs Prisma db push for MongoDB
 * @param {boolean} verbose - Enable verbose output
 * @param {boolean} nonInteractive - Run in non-interactive mode (accepts data loss, for Lambda/CI)
 * @returns {Promise<Object>} { success: boolean, output?: string, error?: string }
 */
async function runPrismaDbPush(verbose = false, nonInteractive = false) {
    return new Promise((resolve) => {
        try {
            const schemaPath = getPrismaSchemaPath('mongodb');

            const args = [
                'prisma',
                'db',
                'push',
                '--schema',
                schemaPath,
                '--skip-generate' // We generate separately
            ];

            // Add non-interactive flag for Lambda/CI environments
            if (nonInteractive) {
                args.push('--accept-data-loss');
            }

            if (verbose) {
                console.log(chalk.gray(`Running: npx ${args.join(' ')}`));
            }

            if (nonInteractive) {
                console.log(chalk.yellow('⚠️  Non-interactive mode: Data loss will be automatically accepted'));
            } else {
                console.log(chalk.yellow('⚠️  Interactive mode: You may be prompted if schema changes cause data loss'));
            }

            const proc = spawn('npx', args, {
                stdio: nonInteractive ? 'pipe' : 'inherit', // Use pipe for non-interactive to capture output
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1'
                }
            });

            let stdout = '';
            let stderr = '';

            // Capture output in non-interactive mode
            if (nonInteractive) {
                if (proc.stdout) {
                    proc.stdout.on('data', (data) => {
                        stdout += data.toString();
                        if (verbose) {
                            process.stdout.write(data);
                        }
                    });
                }
                if (proc.stderr) {
                    proc.stderr.on('data', (data) => {
                        stderr += data.toString();
                        if (verbose) {
                            process.stderr.write(data);
                        }
                    });
                }
            }

            proc.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        output: nonInteractive ? stdout || 'Database push completed successfully' : 'Database push completed successfully'
                    });
                } else {
                    resolve({
                        success: false,
                        error: `Database push process exited with code ${code}`,
                        output: stderr || stdout
                    });
                }
            });

        } catch (error) {
            resolve({
                success: false,
                error: error.message
            });
        }
    });
}

/**
 * Runs Prisma migrate resolve to mark a migration as applied or rolled back
 * @param {string} migrationName - Name of the migration to resolve (e.g., '20251112195422_update_user_unique_constraints')
 * @param {'applied'|'rolled-back'} action - Whether to mark as applied or rolled back
 * @param {boolean} verbose - Enable verbose output
 * @returns {Promise<Object>} { success: boolean, output?: string, error?: string }
 */
async function runPrismaMigrateResolve(migrationName, action = 'applied', verbose = false) {
    return new Promise((resolve) => {
        try {
            const schemaPath = getPrismaSchemaPath('postgresql');

            // Get Prisma binary path (checks multiple locations)
            const prismaBin = getPrismaBinaryPath();

            // Determine args based on whether we're using direct binary or npx
            const isDirectBinary = prismaBin !== 'npx prisma';
            const args = isDirectBinary
                ? ['migrate', 'resolve', `--${action}`, migrationName, '--schema', schemaPath]
                : ['prisma', 'migrate', 'resolve', `--${action}`, migrationName, '--schema', schemaPath];

            if (verbose) {
                const displayCmd = isDirectBinary
                    ? `${prismaBin} ${args.join(' ')}`
                    : `npx ${args.join(' ')}`;
                console.log(chalk.gray(`Running: ${displayCmd}`));
            }

            // Execute the command (prismaBin might be 'node /path/to/index.js' or 'npx prisma')
            const [executable, ...executableArgs] = prismaBin.split(' ');
            const fullArgs = [...executableArgs, ...args];

            const proc = spawn(executable, fullArgs, {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    PRISMA_HIDE_UPDATE_MESSAGE: '1'
                }
            });

            proc.on('error', (error) => {
                resolve({
                    success: false,
                    error: error.message
                });
            });

            proc.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        output: `Migration ${migrationName} marked as ${action}`
                    });
                } else {
                    resolve({
                        success: false,
                        error: `Resolve process exited with code ${code}`
                    });
                }
            });

        } catch (error) {
            resolve({
                success: false,
                error: error.message
            });
        }
    });
}

/**
 * Determines migration command based on STAGE environment variable
 * @param {string} stage - Stage from CLI option or environment
 * @returns {'dev'|'deploy'}
 */
function getMigrationCommand(stage) {
    // Always use 'deploy' in Lambda environment (it's non-interactive and doesn't create migrations)
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

module.exports = {
    getPrismaSchemaPath,
    runPrismaGenerate,
    checkDatabaseState,
    runPrismaMigrate,
    runPrismaMigrateResolve,
    runPrismaDbPush,
    getMigrationCommand
};
