const {
    DATABASE_URL_EXAMPLES,
    getDatabaseUrlMissingError,
    getDatabaseTypeNotConfiguredError,
    getDatabaseConnectionError,
    getPrismaClientNotGeneratedError,
    getPrismaCommandError,
    getDatabaseSetupSuccess
} = require('../../../utils/error-messages');

describe('Error Messages Utility', () => {
    describe('DATABASE_URL_EXAMPLES', () => {
        it('should include MongoDB connection string example', () => {
            expect(DATABASE_URL_EXAMPLES.mongodb).toBeDefined();
            expect(DATABASE_URL_EXAMPLES.mongodb).toContain('mongodb://');
            expect(DATABASE_URL_EXAMPLES.mongodb).toContain('replicaSet=rs0');
        });

        it('should include DocumentDB connection string example', () => {
            expect(DATABASE_URL_EXAMPLES.documentdb).toBeDefined();
            expect(DATABASE_URL_EXAMPLES.documentdb).toContain('docdb');
            expect(DATABASE_URL_EXAMPLES.documentdb).toContain('retryWrites=false');
        });

        it('should include PostgreSQL connection string example', () => {
            expect(DATABASE_URL_EXAMPLES.postgresql).toBeDefined();
            expect(DATABASE_URL_EXAMPLES.postgresql).toContain('postgresql://');
            expect(DATABASE_URL_EXAMPLES.postgresql).toContain('schema=public');
        });
    });

    describe('getDatabaseUrlMissingError()', () => {
        it('should return formatted error message', () => {
            const message = getDatabaseUrlMissingError();

            expect(message).toBeTruthy();
            expect(typeof message).toBe('string');
        });

        it('should include all database type examples', () => {
            const message = getDatabaseUrlMissingError();

            expect(message).toContain('MongoDB');
            expect(message).toContain('DocumentDB');
            expect(message).toContain('PostgreSQL');
        });

        it('should include example connection strings', () => {
            const message = getDatabaseUrlMissingError();

            expect(message).toContain(DATABASE_URL_EXAMPLES.mongodb);
            expect(message).toContain(DATABASE_URL_EXAMPLES.documentdb);
            expect(message).toContain(DATABASE_URL_EXAMPLES.postgresql);
        });

        it('should suggest running frigg db:setup', () => {
            const message = getDatabaseUrlMissingError();

            expect(message).toContain('frigg db:setup');
        });

        it('should mention .env file', () => {
            const message = getDatabaseUrlMissingError();

            expect(message).toContain('.env');
        });
    });

    describe('getDatabaseTypeNotConfiguredError()', () => {
        it('should return formatted error message', () => {
            const message = getDatabaseTypeNotConfiguredError();

            expect(message).toBeTruthy();
            expect(typeof message).toBe('string');
        });

        it('should include PostgreSQL configuration example', () => {
            const message = getDatabaseTypeNotConfiguredError();

            expect(message).toContain('postgres');
            expect(message).toContain('enable: true');
        });

        it('should include MongoDB configuration example', () => {
            const message = getDatabaseTypeNotConfiguredError();

            expect(message).toContain('mongoDB');
            expect(message).toContain('enable: true');
        });

        it('should include DocumentDB configuration example', () => {
            const message = getDatabaseTypeNotConfiguredError();

            expect(message).toContain('documentDB');
            expect(message).toContain('enable: true');
        });

        it('should mention app definition location', () => {
            const message = getDatabaseTypeNotConfiguredError();

            expect(message).toContain('backend/index.js');
            expect(message).toContain('index.js');
        });
    });

    describe('getDatabaseConnectionError()', () => {
        const mockError = 'Connection refused';

        it('should include error message for MongoDB', () => {
            const message = getDatabaseConnectionError(mockError, 'mongodb');

            expect(message).toContain(mockError);
        });

        it('should include error message for PostgreSQL', () => {
            const message = getDatabaseConnectionError(mockError, 'postgresql');

            expect(message).toContain(mockError);
        });

        it('should include MongoDB-specific troubleshooting for MongoDB', () => {
            const message = getDatabaseConnectionError(mockError, 'mongodb');

            expect(message).toContain('replica set');
            expect(message).toContain('rs.initiate');
            expect(message).toContain('mongosh');
            expect(message).toContain('27017');
        });

        it('should include DocumentDB-specific troubleshooting for DocumentDB', () => {
            const message = getDatabaseConnectionError(mockError, 'documentdb');

            expect(message).toContain('DocumentDB');
            expect(message).toContain('retryWrites=false');
            expect(message).toContain('global-bundle.pem');
        });

        it('should include PostgreSQL-specific troubleshooting for PostgreSQL', () => {
            const message = getDatabaseConnectionError(mockError, 'postgresql');

            expect(message).toContain('pg_hba.conf');
            expect(message).toContain('pg_isready');
            expect(message).toContain('psql');
            expect(message).toContain('5432');
        });

        it('should not include PostgreSQL troubleshooting for MongoDB', () => {
            const message = getDatabaseConnectionError(mockError, 'mongodb');

            expect(message).not.toContain('pg_hba.conf');
            expect(message).not.toContain('pg_isready');
        });

        it('should not include MongoDB troubleshooting for PostgreSQL', () => {
            const message = getDatabaseConnectionError(mockError, 'postgresql');

            expect(message).not.toContain('replica set');
            expect(message).not.toContain('rs.initiate');
        });

        it('should include general troubleshooting steps', () => {
            const messageMongo = getDatabaseConnectionError(mockError, 'mongodb');
            const messagePostgres = getDatabaseConnectionError(mockError, 'postgresql');

            expect(messageMongo).toContain('Troubleshooting');
            expect(messagePostgres).toContain('Troubleshooting');
        });

        it('should display database name in the error output', () => {
            const message = getDatabaseConnectionError(mockError, 'documentdb');

            expect(message).toContain('AWS DocumentDB (MongoDB-compatible)');
        });

        it('should show DATABASE_URL when available', () => {
            process.env.DATABASE_URL = 'mongodb://test';
            const message = getDatabaseConnectionError(mockError, 'mongodb');

            expect(message).toContain('mongodb://test');
            delete process.env.DATABASE_URL;
        });

        it('should handle missing DATABASE_URL gracefully', () => {
            delete process.env.DATABASE_URL;
            const message = getDatabaseConnectionError(mockError, 'mongodb');

            expect(message).toContain('not set');
        });
    });

    describe('getPrismaClientNotGeneratedError()', () => {
        it('should return error message for MongoDB', () => {
            const message = getPrismaClientNotGeneratedError('mongodb');

            expect(message).toBeTruthy();
            expect(message).toContain('mongodb');
        });

        it('should return error message for PostgreSQL', () => {
            const message = getPrismaClientNotGeneratedError('postgresql');

            expect(message).toBeTruthy();
            expect(message).toContain('postgresql');
        });

        it('should include correct client package name for MongoDB', () => {
            const message = getPrismaClientNotGeneratedError('mongodb');

            expect(message).toContain('@prisma-mongodb/client');
        });

        it('should mention Mongo client reuse for DocumentDB', () => {
            const message = getPrismaClientNotGeneratedError('documentdb');

            expect(message).toContain('@prisma-mongodb/client');
            expect(message).toContain('DocumentDB reuses the MongoDB Prisma client');
        });

        it('should include correct client package name for PostgreSQL', () => {
            const message = getPrismaClientNotGeneratedError('postgresql');

            expect(message).toContain('@prisma-postgresql/client');
        });

        it('should suggest running frigg db:setup', () => {
            const message = getPrismaClientNotGeneratedError('mongodb');

            expect(message).toContain('frigg db:setup');
        });

        it('should explain what will happen when running db:setup', () => {
            const message = getPrismaClientNotGeneratedError('mongodb');

            expect(message).toContain('Generate the Prisma client');
            expect(message).toContain('Set up database schema');
        });
    });

    describe('getPrismaCommandError()', () => {
        const mockCommand = 'generate';
        const mockError = 'Schema validation failed';

        it('should include command name', () => {
            const message = getPrismaCommandError(mockCommand, mockError);

            expect(message).toContain('generate');
        });

        it('should include error message', () => {
            const message = getPrismaCommandError(mockCommand, mockError);

            expect(message).toContain(mockError);
        });

        it('should list common causes', () => {
            const message = getPrismaCommandError(mockCommand, mockError);

            expect(message).toContain('Common causes');
            expect(message).toContain('schema');
        });

        it('should suggest running frigg db:setup', () => {
            const message = getPrismaCommandError(mockCommand, mockError);

            expect(message).toContain('frigg db:setup');
        });

        it('should suggest checking DATABASE_URL', () => {
            const message = getPrismaCommandError(mockCommand, mockError);

            expect(message).toContain('DATABASE_URL');
        });

        it('should work with different command names', () => {
            const migrateMessage = getPrismaCommandError('migrate', mockError);
            const pushMessage = getPrismaCommandError('db push', mockError);

            expect(migrateMessage).toContain('migrate');
            expect(pushMessage).toContain('db push');
        });
    });

    describe('getDatabaseSetupSuccess()', () => {
        it('should include database type for MongoDB', () => {
            const message = getDatabaseSetupSuccess('mongodb', 'development');

            expect(message).toContain('MongoDB');
        });

        it('should include database type for PostgreSQL', () => {
            const message = getDatabaseSetupSuccess('postgresql', 'production');

            expect(message).toContain('PostgreSQL');
        });

        it('should include database type for DocumentDB', () => {
            const message = getDatabaseSetupSuccess('documentdb', 'production');

            expect(message).toContain('AWS DocumentDB (MongoDB-compatible)');
        });

        it('should include stage information', () => {
            const devMessage = getDatabaseSetupSuccess('mongodb', 'development');
            const prodMessage = getDatabaseSetupSuccess('postgresql', 'production');

            expect(devMessage).toContain('development');
            expect(prodMessage).toContain('production');
        });

        it('should mention different operations for MongoDB vs PostgreSQL', () => {
            const mongoMessage = getDatabaseSetupSuccess('mongodb', 'development');
            const postgresMessage = getDatabaseSetupSuccess('postgresql', 'development');

            expect(mongoMessage).toContain('Schema pushed');
            expect(postgresMessage).toContain('Migrations applied');
        });

        it('should mention DocumentDB-specific schema messaging', () => {
            const message = getDatabaseSetupSuccess('documentdb', 'development');

            expect(message).toContain('Schema pushed to DocumentDB');
        });

        it('should suggest next steps', () => {
            const message = getDatabaseSetupSuccess('mongodb', 'development');

            expect(message).toContain('frigg start');
            expect(message).toContain('Next steps');
        });

        it('should confirm what happened during setup', () => {
            const message = getDatabaseSetupSuccess('mongodb', 'development');

            expect(message).toContain('Prisma client generated');
            expect(message).toContain('Database connection verified');
        });

        it('should show success indicators', () => {
            const message = getDatabaseSetupSuccess('mongodb', 'development');

            expect(message).toContain('successfully');
            expect(message).toContain('completed');
        });
    });
});
