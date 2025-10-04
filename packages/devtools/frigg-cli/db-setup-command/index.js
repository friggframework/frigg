const path = require('path');
const chalk = require('chalk');
const dotenv = require('dotenv');
const {
    validateDatabaseUrl,
    getDatabaseType,
    testDatabaseConnection
} = require('../utils/database-validator');
const {
    runPrismaGenerate,
    checkDatabaseState,
    runPrismaMigrate,
    runPrismaDbPush,
    getMigrationCommand
} = require('../utils/prisma-runner');
const {
    getDatabaseUrlMissingError,
    getDatabaseTypeNotConfiguredError,
    getDatabaseConnectionError,
    getPrismaCommandError,
    getDatabaseSetupSuccess
} = require('../utils/error-messages');

/**
 * Database Setup Command
 * Sets up the database for a Frigg application:
 * - Validates configuration
 * - Generates Prisma client
 * - Runs migrations (PostgreSQL) or db push (MongoDB)
 */

async function dbSetupCommand(options = {}) {
    const verbose = options.verbose || false;
    const stage = options.stage || process.env.STAGE || 'development';

    console.log(chalk.blue('🔧 Frigg Database Setup'));
    console.log(chalk.gray(`Stage: ${stage}\n`));

    // Load environment variables from .env file
    const envPath = path.join(process.cwd(), '.env');
    dotenv.config({ path: envPath });

    try {
        // Step 1: Validate DATABASE_URL
        if (verbose) {
            console.log(chalk.gray('Step 1: Validating DATABASE_URL...'));
        }

        const urlValidation = validateDatabaseUrl();
        if (!urlValidation.valid) {
            console.error(getDatabaseUrlMissingError());
            process.exit(1);
        }

        if (verbose) {
            console.log(chalk.green('✓ DATABASE_URL found\n'));
        }

        // Step 2: Determine database type from app definition
        if (verbose) {
            console.log(chalk.gray('Step 2: Determining database type...'));
        }

        const dbTypeResult = getDatabaseType();
        if (dbTypeResult.error) {
            console.error(chalk.red('❌ ' + dbTypeResult.error));
            console.error(getDatabaseTypeNotConfiguredError());
            process.exit(1);
        }

        const dbType = dbTypeResult.dbType;
        console.log(chalk.cyan(`Database type: ${dbType}`));

        if (verbose) {
            console.log(chalk.green(`✓ Using ${dbType}\n`));
        }

        // Step 3: Test database connection
        if (verbose) {
            console.log(chalk.gray('Step 3: Testing database connection...'));
        }

        console.log(chalk.gray('Connecting to database...'));
        const connectionTest = await testDatabaseConnection(urlValidation.url, dbType);

        if (!connectionTest.connected) {
            console.error(getDatabaseConnectionError(connectionTest.error, dbType));
            process.exit(1);
        }

        console.log(chalk.green('✓ Database connection verified\n'));

        // Step 4: Generate Prisma client
        console.log(chalk.cyan('Generating Prisma client...'));

        const generateResult = await runPrismaGenerate(dbType, verbose);

        if (!generateResult.success) {
            console.error(getPrismaCommandError('generate', generateResult.error));
            if (generateResult.output) {
                console.error(chalk.gray(generateResult.output));
            }
            process.exit(1);
        }

        console.log(chalk.green('✓ Prisma client generated\n'));

        // Step 5: Check database state
        if (verbose) {
            console.log(chalk.gray('Step 5: Checking database state...'));
        }

        const stateCheck = await checkDatabaseState(dbType);

        // Step 6: Run migrations or db push
        if (dbType === 'postgresql') {
            console.log(chalk.cyan('Running database migrations...'));

            const migrationCommand = getMigrationCommand(stage);

            if (verbose) {
                console.log(chalk.gray(`Using migration command: ${migrationCommand}`));
            }

            if (stateCheck.upToDate && migrationCommand === 'deploy') {
                console.log(chalk.yellow('Database is already up-to-date'));
            } else {
                const migrateResult = await runPrismaMigrate(migrationCommand, verbose);

                if (!migrateResult.success) {
                    console.error(getPrismaCommandError('migrate', migrateResult.error));
                    if (migrateResult.output) {
                        console.error(chalk.gray(migrateResult.output));
                    }
                    process.exit(1);
                }

                console.log(chalk.green('✓ Migrations applied\n'));
            }

        } else if (dbType === 'mongodb') {
            console.log(chalk.cyan('Pushing schema to MongoDB...'));

            const pushResult = await runPrismaDbPush(verbose);

            if (!pushResult.success) {
                console.error(getPrismaCommandError('db push', pushResult.error));
                if (pushResult.output) {
                    console.error(chalk.gray(pushResult.output));
                }
                process.exit(1);
            }

            console.log(chalk.green('✓ Schema pushed to database\n'));
        }

        // Success!
        console.log(getDatabaseSetupSuccess(dbType, stage));

    } catch (error) {
        console.error(chalk.red('\n❌ Database setup failed'));
        console.error(chalk.gray(error.message));

        if (verbose && error.stack) {
            console.error(chalk.gray('\nStack trace:'));
            console.error(chalk.gray(error.stack));
        }

        console.error(chalk.yellow('\nTroubleshooting:'));
        console.error(chalk.gray('  • Verify DATABASE_URL in your .env file'));
        console.error(chalk.gray('  • Check database is running and accessible'));
        console.error(chalk.gray('  • Ensure app definition has database configuration'));
        console.error(chalk.gray('  • Run with --verbose flag for more details'));

        process.exit(1);
    }
}

module.exports = { dbSetupCommand };
