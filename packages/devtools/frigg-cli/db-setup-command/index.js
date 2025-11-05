const path = require('path');
const chalk = require('chalk');
const dotenv = require('dotenv');
const {
    validateDatabaseUrl,
    getDatabaseType,
    checkPrismaClientGenerated
} = require('../utils/database-validator');
const {
    runPrismaGenerate,
    checkDatabaseState,
    runPrismaMigrate,
    runPrismaDbPush,
    getMigrationCommand
} = require('@friggframework/core/database/utils/prisma-runner');
const {
    getDatabaseUrlMissingError,
    getDatabaseTypeNotConfiguredError,
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

            // Show stack trace in verbose mode for debugging
            if (verbose && dbTypeResult.stack) {
                console.error(chalk.gray('\nStack trace:'));
                console.error(chalk.gray(dbTypeResult.stack));
            }

            console.error(getDatabaseTypeNotConfiguredError());
            process.exit(1);
        }

        const dbType = dbTypeResult.dbType;
        console.log(chalk.cyan(`Database type: ${dbType}`));

        if (verbose) {
            console.log(chalk.green(`✓ Using ${dbType}\n`));
        }

        // Step 3: Check if Prisma client exists, generate if needed
        if (verbose) {
            console.log(chalk.gray('Step 3: Checking Prisma client...'));
        }

        const clientCheck = checkPrismaClientGenerated(dbType);
        const forceRegenerate = options.force || false;

        // Determine if we need to generate/regenerate
        const needsGeneration = !clientCheck.generated ||
                               clientCheck.needsRegeneration ||
                               forceRegenerate;

        if (!needsGeneration) {
            // Client already exists with correct platform binaries
            console.log(chalk.green('✓ Prisma client already exists with correct platform binaries\n'));
            if (verbose) {
                console.log(chalk.gray(`  Client location: ${clientCheck.path}`));
                if (clientCheck.platformBinary) {
                    console.log(chalk.gray(`  Platform binary: ${clientCheck.platformBinary}\n`));
                }
            }
        } else {
            // Determine the reason for generation
            if (forceRegenerate && clientCheck.generated) {
                console.log(chalk.yellow('⚠️  Forcing Prisma client regeneration...'));
            } else if (clientCheck.needsRegeneration) {
                console.log(chalk.yellow('⚠️  Regenerating Prisma client for your platform...'));
                if (verbose && clientCheck.availableTargets && clientCheck.availableTargets.length > 0) {
                    console.log(chalk.gray(`   Existing binaries: ${clientCheck.availableTargets.join(', ')}`));
                }
                if (verbose && clientCheck.requiredTarget) {
                    console.log(chalk.gray(`   Required binary: ${clientCheck.requiredTarget}`));
                }
            } else {
                console.log(chalk.cyan('Generating Prisma client...'));
            }

            const generateResult = await runPrismaGenerate(dbType, verbose);

            if (!generateResult.success) {
                console.error(getPrismaCommandError('generate', generateResult.error));
                if (generateResult.output) {
                    console.error(chalk.gray(generateResult.output));
                }
                process.exit(1);
            }

            console.log(chalk.green('✓ Prisma client generated with platform-specific binaries\n'));
        }

        // Step 4: Check database state
        // Note: We skip connection testing in db:setup because when using frigg:local,
        // the CLI code runs from tmp/frigg but the client is in backend/node_modules,
        // causing module resolution mismatches. Connection testing happens in frigg start.
        if (verbose) {
            console.log(chalk.gray('Step 4: Checking database state...'));
        }

        const stateCheck = await checkDatabaseState(dbType);

        // Step 5: Run migrations or db push
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
