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
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to schema file
 * @throws {Error} If schema file doesn't exist
 */
function getPrismaSchemaPath(dbType, projectRoot = process.cwd()) {
    // Try multiple locations for the schema file
    // Priority order:
    // 1. Local node_modules (where @friggframework/core is installed - production scenario)
    // 2. Parent node_modules (workspace/monorepo setup)
    const possiblePaths = [
        // Check where Frigg is installed via npm (production scenario)
        path.join(projectRoot, 'node_modules', '@friggframework', 'core', `prisma-${dbType}`, 'schema.prisma'),
        path.join(projectRoot, '..', 'node_modules', '@friggframework', 'core', `prisma-${dbType}`, 'schema.prisma')
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
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @param {boolean} verbose - Enable verbose output
 * @returns {Promise<Object>} { success: boolean, output?: string, error?: string }
 */
async function runPrismaGenerate(dbType, verbose = false) {
    try {
        const schemaPath = getPrismaSchemaPath(dbType);

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
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @returns {Promise<Object>} { upToDate: boolean, pendingMigrations?: number, error?: string }
 */
async function checkDatabaseState(dbType) {
    try {
        // Only applicable for PostgreSQL (MongoDB uses db push)
        if (dbType !== 'postgresql') {
            return { upToDate: true };
        }

        const schemaPath = getPrismaSchemaPath(dbType);

        const output = execSync(
            `npx prisma migrate status --schema=${schemaPath}`,
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
 * Runs Prisma migrate for PostgreSQL
 * @param {'dev'|'deploy'} command - Migration command (dev or deploy)
 * @param {boolean} verbose - Enable verbose output
 * @returns {Promise<Object>} { success: boolean, output?: string, error?: string }
 */
async function runPrismaMigrate(command = 'dev', verbose = false) {
    return new Promise((resolve) => {
        try {
            const schemaPath = getPrismaSchemaPath('postgresql');

            const args = [
                'prisma',
                'migrate',
                command,
                '--schema',
                schemaPath
            ];

            if (verbose) {
                console.log(chalk.gray(`Running: npx ${args.join(' ')}`));
            }

            const proc = spawn('npx', args, {
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
 * Interactive - will prompt user if data loss detected
 * @param {boolean} verbose - Enable verbose output
 * @returns {Promise<Object>} { success: boolean, output?: string, error?: string }
 */
async function runPrismaDbPush(verbose = false) {
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

            if (verbose) {
                console.log(chalk.gray(`Running: npx ${args.join(' ')}`));
            }

            console.log(chalk.yellow('⚠️  Interactive mode: You may be prompted if schema changes cause data loss'));

            const proc = spawn('npx', args, {
                stdio: 'inherit', // Interactive mode - user can respond to prompts
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
                        output: 'Database push completed successfully'
                    });
                } else {
                    resolve({
                        success: false,
                        error: `Database push process exited with code ${code}`
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
    runPrismaDbPush,
    getMigrationCommand
};
