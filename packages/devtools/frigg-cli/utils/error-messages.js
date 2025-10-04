const chalk = require('chalk');

/**
 * Error Messages Module
 * Provides helpful, context-aware error messages for database setup issues
 */

/**
 * Database URL examples for both supported database types
 */
const DATABASE_URL_EXAMPLES = {
    mongodb: 'mongodb://localhost:27017/frigg?replicaSet=rs0',
    postgresql: 'postgresql://postgres:postgres@localhost:5432/frigg?schema=public'
};

/**
 * Gets helpful error message for missing DATABASE_URL
 * @returns {string} Formatted error message
 */
function getDatabaseUrlMissingError() {
    return `
${chalk.red('❌ DATABASE_URL environment variable not found')}

${chalk.bold('Add DATABASE_URL to your .env file:')}

${chalk.cyan('For MongoDB:')}
  ${chalk.gray('DATABASE_URL')}=${chalk.green(`"${DATABASE_URL_EXAMPLES.mongodb}"`)}

${chalk.cyan('For PostgreSQL:')}
  ${chalk.gray('DATABASE_URL')}=${chalk.green(`"${DATABASE_URL_EXAMPLES.postgresql}"`)}

${chalk.yellow('Then run:')} ${chalk.cyan('frigg db:setup')}
`;
}

/**
 * Gets helpful error message for missing database type configuration
 * @returns {string} Formatted error message
 */
function getDatabaseTypeNotConfiguredError() {
    return `
${chalk.red('❌ Database type not configured in app definition')}

${chalk.bold('Add database configuration to your app definition file:')}
${chalk.gray('(backend/index.js or index.js)')}

${chalk.cyan('For PostgreSQL:')}
${chalk.gray(`
const appDefinition = {
  // ... other configuration
  database: {
    postgres: { enable: true }
  }
};
`)}

${chalk.cyan('For MongoDB:')}
${chalk.gray(`
const appDefinition = {
  // ... other configuration
  database: {
    mongoDB: { enable: true }
  }
};
`)}

${chalk.cyan('For AWS DocumentDB (MongoDB-compatible):')}
${chalk.gray(`
const appDefinition = {
  // ... other configuration
  database: {
    documentDB: { enable: true }
  }
};
`)}
`;
}

/**
 * Gets helpful error message for database connection failure
 * @param {string} error - Connection error message
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @returns {string} Formatted error message
 */
function getDatabaseConnectionError(error, dbType) {
    const troubleshootingSteps = dbType === 'mongodb'
        ? getMongoDatabaseTroubleshooting()
        : getPostgresTroubleshooting();

    return `
${chalk.red('❌ Failed to connect to database')}

${chalk.bold('Connection error:')}
${chalk.gray(error)}

${chalk.bold('Troubleshooting steps:')}
${troubleshootingSteps}

${chalk.yellow('Verify your DATABASE_URL:')} ${chalk.cyan(process.env.DATABASE_URL || 'not set')}
`;
}

/**
 * Gets MongoDB-specific troubleshooting steps
 * @returns {string} Formatted troubleshooting steps
 */
function getMongoDatabaseTroubleshooting() {
    return `
${chalk.gray('1.')} Verify MongoDB is running
   ${chalk.cyan('docker ps')} ${chalk.gray('(if using Docker)')}
   ${chalk.cyan('mongosh --eval "db.version()"')} ${chalk.gray('(test connection)')}

${chalk.gray('2.')} Check if replica set is initialized
   ${chalk.gray('MongoDB requires a replica set for Prisma')}
   ${chalk.cyan('mongosh')}
   ${chalk.cyan('rs.status()')} ${chalk.gray('(should show replica set info)')}

${chalk.gray('3.')} Initialize replica set if needed
   ${chalk.cyan('docker exec -it <mongodb-container> mongosh')}
   ${chalk.cyan('rs.initiate()')}

${chalk.gray('4.')} Verify connection string format
   ${chalk.gray('mongodb://[username:password@]host[:port]/database[?options]')}
   ${chalk.green('Example: mongodb://localhost:27017/frigg?replicaSet=rs0')}

${chalk.gray('5.')} Check network/firewall settings
   ${chalk.gray('Ensure port 27017 (default) is accessible')}
`;
}

/**
 * Gets PostgreSQL-specific troubleshooting steps
 * @returns {string} Formatted troubleshooting steps
 */
function getPostgresTroubleshooting() {
    return `
${chalk.gray('1.')} Verify PostgreSQL is running
   ${chalk.cyan('docker ps')} ${chalk.gray('(if using Docker)')}
   ${chalk.cyan('pg_isready')} ${chalk.gray('(test if server is ready)')}

${chalk.gray('2.')} Check connection string format
   ${chalk.gray('postgresql://[username:password@]host[:port]/database[?options]')}
   ${chalk.green('Example: postgresql://postgres:postgres@localhost:5432/frigg?schema=public')}

${chalk.gray('3.')} Verify database exists
   ${chalk.cyan('psql -U postgres -l')} ${chalk.gray('(list databases)')}
   ${chalk.cyan('CREATE DATABASE frigg;')} ${chalk.gray('(if needed)')}

${chalk.gray('4.')} Check pg_hba.conf allows connections
   ${chalk.gray('Location: /var/lib/postgresql/data/pg_hba.conf (Docker)')}
   ${chalk.gray('Ensure trust/md5 authentication is enabled for your host')}

${chalk.gray('5.')} Verify network/firewall settings
   ${chalk.gray('Ensure port 5432 (default) is accessible')}
`;
}

/**
 * Gets helpful error message for missing Prisma client
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @returns {string} Formatted error message
 */
function getPrismaClientNotGeneratedError(dbType) {
    const clientName = dbType === 'mongodb' ? '@prisma-mongo/client' : '@prisma-postgres/client';

    return `
${chalk.red(`❌ Prisma client not generated for ${dbType}`)}

${chalk.bold('The Prisma client needs to be generated before starting the application.')}

${chalk.yellow('Run:')} ${chalk.cyan('frigg db:setup')}

${chalk.gray('This will:')}
${chalk.gray('  • Generate the Prisma client')} ${chalk.gray(`(${clientName})`)}
${chalk.gray('  • Set up database schema')}
${chalk.gray('  • Run migrations (PostgreSQL) or db push (MongoDB)')}
`;
}

/**
 * Gets helpful error message for Prisma command failures
 * @param {string} command - Command that failed (generate, migrate, push)
 * @param {string} error - Error message
 * @returns {string} Formatted error message
 */
function getPrismaCommandError(command, error) {
    return `
${chalk.red(`❌ Prisma ${command} failed`)}

${chalk.bold('Error:')}
${chalk.gray(error)}

${chalk.bold('Common causes:')}
${chalk.gray('  • Database schema has conflicts')}
${chalk.gray('  • Database connection lost during operation')}
${chalk.gray('  • Insufficient permissions')}
${chalk.gray('  • Schema file is invalid')}

${chalk.yellow('Try:')}
${chalk.cyan('  frigg db:setup')} ${chalk.gray('(re-run setup)')}
${chalk.cyan('  Check your DATABASE_URL')} ${chalk.gray('(verify connection string)')}
${chalk.cyan('  Review Prisma schema')} ${chalk.gray('(node_modules/@friggframework/core/prisma-*/schema.prisma)')}
`;
}

/**
 * Gets success message for database setup completion
 * @param {'mongodb'|'postgresql'} dbType - Database type
 * @param {string} stage - Deployment stage
 * @returns {string} Formatted success message
 */
function getDatabaseSetupSuccess(dbType, stage) {
    return `
${chalk.green('✅ Database setup completed successfully!')}

${chalk.bold('Configuration:')}
${chalk.gray('  Database type:')} ${chalk.cyan(dbType)}
${chalk.gray('  Stage:')} ${chalk.cyan(stage)}
${chalk.gray('  Connection:')} ${chalk.green('verified')}

${chalk.bold('What happened:')}
${chalk.gray('  ✓')} Prisma client generated
${chalk.gray('  ✓')} Database connection verified
${chalk.gray('  ✓')} ${dbType === 'postgresql' ? 'Migrations applied' : 'Schema pushed to database'}

${chalk.yellow('Next steps:')}
${chalk.cyan('  frigg start')} ${chalk.gray('(start your application)')}
`;
}

/**
 * Gets warning message for database already up-to-date
 * @returns {string} Formatted warning message
 */
function getDatabaseAlreadyUpToDate() {
    return `
${chalk.yellow('⚠️  Database is already up-to-date')}

${chalk.gray('No migrations or schema changes detected.')}

${chalk.yellow('If you expected changes:')}
${chalk.gray('  • Check if schema was modified in node_modules/@friggframework/core/prisma-*/')}
${chalk.gray('  • Verify DATABASE_URL points to the correct database')}
${chalk.gray('  • Check if you\'re in the correct project directory')}
`;
}

module.exports = {
    DATABASE_URL_EXAMPLES,
    getDatabaseUrlMissingError,
    getDatabaseTypeNotConfiguredError,
    getDatabaseConnectionError,
    getPrismaClientNotGeneratedError,
    getPrismaCommandError,
    getDatabaseSetupSuccess,
    getDatabaseAlreadyUpToDate
};
