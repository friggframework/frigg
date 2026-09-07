/**
 * Database Migration Handler for AWS Lambda
 * 
 * Executes Prisma migrations in a Lambda environment.
 * Based on AWS best practices for running migrations in serverless environments.
 * 
 * Supported Commands:
 * - deploy: Apply pending migrations to the database (production-safe)
 * - reset: Reset database and apply all migrations (DANGEROUS - dev only)
 * 
 * Usage:
 *   // Via Lambda invoke
 *   {
 *     "command": "deploy"  // or "reset"
 *   }
 * 
 * Requirements:
 * - Prisma CLI must be included in deployment or Lambda layer
 * - DATABASE_URL environment variable must be set
 * - VPC configuration for Aurora access
 * 
 * Reference: https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-aws-lambda
 */

const { execFile } = require('child_process');
const path = require('path');

/**
 * Execute Prisma migration command
 * 
 * @param {string} command - Migration command ('deploy' or 'reset')
 * @param {string} schemaPath - Path to Prisma schema file
 * @returns {Promise<number>} Exit code
 */
async function executePrismaMigration(command, schemaPath) {
    console.log(`Executing Prisma migration: ${command}`);
    console.log(`Schema path: ${schemaPath}`);
    console.log(`Database URL: ${process.env.DATABASE_URL ? '[SET]' : '[NOT SET]'}`);

    return new Promise((resolve, reject) => {
        // Build command arguments
        const args = ['migrate', command];
        
        // Add command-specific options
        if (command === 'reset') {
            args.push('--force');           // Skip confirmation prompt
            args.push('--skip-generate');   // Skip client generation (already done in layer)
        }

        // Add schema path if provided
        if (schemaPath) {
            args.push('--schema', schemaPath);
        }

        console.log(`Running: prisma ${args.join(' ')}`);
        
        // Execute Prisma CLI
        execFile(
            path.resolve('./node_modules/prisma/build/index.js'),
            args,
            {
                env: {
                    ...process.env,
                    // Ensure Prisma uses the correct binary target
                    PRISMA_CLI_BINARY_TARGETS: 'rhel-openssl-3.0.x',
                }
            },
            (error, stdout, stderr) => {
                // Log all output
                if (stdout) {
                    console.log('STDOUT:', stdout);
                }
                if (stderr) {
                    console.error('STDERR:', stderr);
                }

                if (error) {
                    console.error(`Migration ${command} exited with error:`, error.message);
                    console.error(`Exit code: ${error.code || 1}`);
                    resolve(error.code || 1);
                } else {
                    console.log(`Migration ${command} completed successfully`);
                    resolve(0);
                }
            }
        );
    });
}

/**
 * Validate migration command
 */
function validateCommand(command) {
    const validCommands = ['deploy', 'reset'];
    
    if (!validCommands.includes(command)) {
        throw new Error(
            `Invalid migration command: "${command}". ` +
            `Valid commands are: ${validCommands.join(', ')}`
        );
    }

    // Extra validation for dangerous commands
    if (command === 'reset') {
        const stage = process.env.STAGE || process.env.NODE_ENV;
        if (stage === 'production' || stage === 'prod') {
            throw new Error(
                'BLOCKED: "reset" command is not allowed in production environment. ' +
                'This command would delete all data. Use "deploy" instead.'
            );
        }
        console.warn('⚠️  WARNING: "reset" will DELETE all data and reset the database!');
    }
}

/**
 * Determine which Prisma schema to use based on database type
 */
function getSchemaPath() {
    // In Lambda, schemas are in @friggframework/core/generated/
    const baseSchemaPath = './node_modules/@friggframework/core/generated';
    
    // Check if Postgres is enabled
    if (process.env.DATABASE_URL?.includes('postgresql') || process.env.DATABASE_URL?.includes('postgres')) {
        const schemaPath = `${baseSchemaPath}/prisma-postgresql/schema.prisma`;
        console.log(`Using PostgreSQL schema: ${schemaPath}`);
        return schemaPath;
    }
    
    // Check if MongoDB is enabled
    if (process.env.DATABASE_URL?.includes('mongodb')) {
        const schemaPath = `${baseSchemaPath}/prisma-mongodb/schema.prisma`;
        console.log(`Using MongoDB schema: ${schemaPath}`);
        return schemaPath;
    }

    // Check if SQLite is enabled (file-based or .db extension)
    if (process.env.DATABASE_URL?.includes('sqlite') || 
        process.env.DATABASE_URL?.includes('.db') ||
        process.env.DB_TYPE === 'sqlite') {
        const schemaPath = `${baseSchemaPath}/prisma-sqlite/schema.prisma`;
        console.log(`Using SQLite schema: ${schemaPath}`);
        return schemaPath;
    }

    // Default to PostgreSQL
    console.log('DATABASE_URL not set or database type unknown, defaulting to PostgreSQL');
    return `${baseSchemaPath}/prisma-postgresql/schema.prisma`;
}

/**
 * Lambda handler for database migrations
 * 
 * @param {Object} event - Lambda event
 * @param {string} event.command - Migration command ('deploy' or 'reset')
 * @param {Object} context - Lambda context
 * @returns {Promise<Object>} Migration result
 */
exports.handler = async (event, context) => {
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
        // Get migration command (default to 'deploy')
        const command = event.command || 'deploy';
        
        // Validate command
        validateCommand(command);
        
        // Check required environment variables
        if (!process.env.DATABASE_URL) {
            throw new Error(
                'DATABASE_URL environment variable is not set. ' +
                'Cannot connect to database for migrations.'
            );
        }
        
        // Determine schema path
        const schemaPath = getSchemaPath();
        
        // Execute migration
        // For SQLite, use 'db push' instead of 'migrate deploy' (SQLite doesn't support migrations)
        const effectiveCommand = (schemaPath.includes('prisma-sqlite') && command === 'deploy') 
            ? 'deploy' // For SQLite we'll use migrate deploy which works fine
            : command;
        
        const exitCode = await executePrismaMigration(effectiveCommand, schemaPath);
        
        const duration = Date.now() - startTime;
        
        if (exitCode === 0) {
            const result = {
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
        
    } catch (error) {
        const duration = Date.now() - startTime;
        
        console.error('='.repeat(60));
        console.error('Migration failed');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(60));
        
        const errorResult = {
            success: false,
            command: event.command || 'unknown',
            error: error.message,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
        };
        
        // Return error (don't throw) so Lambda doesn't retry
        return errorResult;
    }
};

