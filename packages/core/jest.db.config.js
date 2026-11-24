/*
 * Database integration suites (`*.db.test.js`).
 *
 * These talk to real databases instead of mocking Prisma, so they are kept
 * out of the default `npm test` run and executed with `npm run test:db`.
 * They need generated Prisma clients (`npm run prisma:generate`) and:
 *   - a MongoDB replica set (Prisma requires one for MongoDB writes):
 *     FRIGG_TEST_MONGODB_URL, default
 *     mongodb://localhost:27017/frigg?replicaSet=rs0
 *   - PostgreSQL with the prisma-postgresql migrations applied:
 *     FRIGG_TEST_POSTGRES_URL, default
 *     postgresql://postgres:postgres@localhost:5432/frigg?schema=public
 * The repository parity suites skip themselves unless their own URLs are
 * set (INTEGRATION_ENTITIES_PARITY_* / QUERY_MAPPINGS_PARITY_*).
 */
const base = require('./jest.config');

module.exports = {
    ...base,
    coverageThreshold: undefined,
    testMatch: ['**/*.db.test.js'],
    testPathIgnorePatterns: ['/node_modules/'],
};
