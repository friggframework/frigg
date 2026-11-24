const chalk = require('chalk');

/**
 * Error Messages Module
 * Provides helpful, context-aware error messages for database setup issues
 */

/**
 * Normalizes MongoDB-compatible database types to 'mongodb'
 * DocumentDB uses the same Prisma client as MongoDB
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @returns {'mongodb'|'postgresql'} Normalized database type
 */
function normalizeMongoCompatible(dbType) {
    return dbType === 'documentdb' ? 'mongodb' : dbType;
}

/**
 * Database URL examples for supported database types
 */
const DATABASE_URL_EXAMPLES = {
  mongodb: 'mongodb://localhost:27017/frigg?replicaSet=rs0',
  documentdb: 'mongodb://frigg-user:yourPassword@docdb-cluster.cluster-xyz123.us-east-1.docdb.amazonaws.com:27017/frigg?tls=true&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false',
  postgresql: 'postgresql://postgres:postgres@localhost:5432/frigg?schema=public'
};

function getDatabaseDisplayName(dbType) {
  switch (dbType) {
    case 'mongodb':
      return 'MongoDB';
    case 'documentdb':
      return 'AWS DocumentDB (MongoDB-compatible)';
    case 'postgresql':
      return 'PostgreSQL';
    default:
      return dbType;
  }
}

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

${chalk.cyan('For AWS DocumentDB (MongoDB-compatible):')}
  ${chalk.gray('DATABASE_URL')}=${chalk.green(`"${DATABASE_URL_EXAMPLES.documentdb}"`)}

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

${chalk.gray('DocumentDB uses the MongoDB Prisma client. Make sure TLS is enabled and replica set compatibility is configured on your cluster.')}
`;
}

/**
 * Gets helpful error message for database connection failure
 * @param {string} error - Connection error message
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @returns {string} Formatted error message
 */
function getDatabaseConnectionError(error, dbType) {
    let troubleshootingSteps;
    if (dbType === 'documentdb') {
        troubleshootingSteps = getDocumentDbTroubleshooting();
    } else if (dbType === 'mongodb') {
        troubleshootingSteps = getMongoDatabaseTroubleshooting();
    } else {
        troubleshootingSteps = getPostgresTroubleshooting();
    }

    return `
${chalk.red('❌ Failed to connect to database')}

${chalk.bold('Connection error:')}
${chalk.gray(error)}

${chalk.bold('Database:')} ${chalk.cyan(getDatabaseDisplayName(dbType))}

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

function getDocumentDbTroubleshooting() {
    return `
${chalk.gray('1.')} Verify DocumentDB cluster is available
   ${chalk.cyan('aws docdb describe-db-clusters --db-cluster-identifier <name>')}

${chalk.gray('2.')} Use TLS with the AWS CA bundle
   ${chalk.gray('Download: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem')}
   ${chalk.gray('Add ?tls=true&tlsCAFile=/path/to/global-bundle.pem to DATABASE_URL')}

${chalk.gray('3.')} Disable retryable writes (DocumentDB limitation)
   ${chalk.gray('Add retryWrites=false to DATABASE_URL query string')}

${chalk.gray('4.')} Include replicaSet parameter
   ${chalk.gray('DocumentDB requires replicaSet=rs0 even for single-node clusters')}

${chalk.gray('5.')} Allow inbound access from your Lambda or local IP
   ${chalk.gray('Update security groups / VPC rules for port 27017')}
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
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @returns {string} Formatted error message
 */
function getPrismaClientNotGeneratedError(dbType) {
  // Normalize DocumentDB to MongoDB (they use the same Prisma client)
  const normalizedType = normalizeMongoCompatible(dbType);
  const clientName = `@prisma-${normalizedType}/client`;
  const documentDbNote = dbType === 'documentdb'
    ? [
      chalk.gray('  • DocumentDB reuses the MongoDB Prisma client (prisma-mongodb)'),
      chalk.gray('  • Confirm your connection string includes tls=true and retryWrites=false')
    ].join('\n')
    : '';

    return `
${chalk.red(`❌ Prisma client not generated for ${dbType}`)}

${chalk.bold('The Prisma client needs to be generated before starting the application.')}

${chalk.yellow('Run:')} ${chalk.cyan('frigg db:setup')}

${chalk.gray('This will:')}
${chalk.gray('  • Generate the Prisma client')} ${chalk.gray(`(${clientName})`)}
${chalk.gray('  • Set up database schema')}
${chalk.gray('  • Run migrations (PostgreSQL) or db push (MongoDB)')}
${documentDbNote ? `${documentDbNote}\n` : ''}
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
 * @param {'mongodb'|'postgresql'|'documentdb'} dbType - Database type
 * @param {string} stage - Deployment stage
 * @returns {string} Formatted success message
 */
function getDatabaseSetupSuccess(dbType, stage) {
    const databaseDisplayName = getDatabaseDisplayName(dbType);
    const schemaAction = dbType === 'postgresql'
        ? 'Migrations applied'
        : dbType === 'documentdb'
            ? 'Schema pushed to DocumentDB'
            : 'Schema pushed to database';

    return `
${chalk.green('✅ Database setup completed successfully!')}

${chalk.bold('Configuration:')}
${chalk.gray('  Database type:')} ${chalk.cyan(databaseDisplayName)}
${chalk.gray('  Stage:')} ${chalk.cyan(stage)}
${chalk.gray('  Connection:')} ${chalk.green('verified')}

${chalk.bold('What happened:')}
${chalk.gray('  ✓')} Prisma client generated
${chalk.gray('  ✓')} Database connection verified
${chalk.gray('  ✓')} ${schemaAction}

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
