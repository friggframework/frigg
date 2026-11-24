/**
 * Every generated Prisma client must carry the query engine for each Lambda
 * architecture the devtools can deploy (see devtools'
 * domains/shared/lambda-architectures.js). The devtools layer build copies
 * these folders as they are, so a client generated without an engine ships a
 * layer that cannot load on that architecture.
 *
 * Runs after `npm run prisma:generate` (the db job), like the other
 * *.db.test.js suites.
 */
const fs = require('fs');
const path = require('path');

const LAMBDA_QUERY_ENGINES = [
    'libquery_engine-rhel-openssl-3.0.x.so.node',
    'libquery_engine-linux-arm64-openssl-3.0.x.so.node',
];

describe.each(['prisma-postgresql', 'prisma-mongodb'])(
    'generated/%s',
    (client) => {
        const clientDir = path.join(__dirname, '..', 'generated', client);

        it.each(LAMBDA_QUERY_ENGINES)('holds %s', (engine) => {
            expect([engine, fs.existsSync(path.join(clientDir, engine))]).toEqual([
                engine,
                true,
            ]);
        });
    }
);
