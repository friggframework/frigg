// The ownership list reads (entities and integrations) use the REAL
// documentdb-utils over a fake $runCommandRaw that serves more than one cursor
// batch, so a read that stops at the first batch (~101 documents) fails here.
jest.mock('../../../database/prisma', () => ({
    prisma: { $runCommandRaw: jest.fn() },
}));
jest.mock('../../../database/documentdb-encryption-service', () => ({
    DocumentDBEncryptionService: class {
        async decryptFields(_model, doc) {
            return doc;
        }

        async encryptFields(_model, doc) {
            return doc;
        }
    },
}));

const { ObjectId } = require('bson');
const { prisma } = require('../../../database/prisma');
const {
    ModuleRepositoryDocumentDB,
} = require('../module-repository-documentdb');
const {
    IntegrationRepositoryDocumentDB,
} = require('../../../integrations/repositories/integration-repository-documentdb');

// Past both the 101-document first batch of a plain find and the drain batch
// size of 1000, so the read needs more than one getMore.
const TOTAL = 2500;

/**
 * A server holding documents per collection. A find without batchSize
 * returns 101 documents and a cursor (as MongoDB does); a find with batchSize
 * returns that many; getMore pages through the rest.
 */
function serveCollections(byCollection) {
    const positions = {};
    prisma.$runCommandRaw.mockImplementation(async (command) => {
        if (command.find) {
            const docs = byCollection[command.find] || [];
            const ids = command.filter?._id?.$in;
            const wanted = ids && new Set(ids.map((id) => id.toHexString()));
            const matching = wanted
                ? docs.filter((d) => wanted.has(d._id.toHexString()))
                : docs;
            const size = command.batchSize
                ? Math.min(command.batchSize, matching.length)
                : Math.min(101, matching.length);
            positions[command.find] = { docs: matching, position: size };
            return {
                ok: 1,
                cursor: {
                    id: size >= matching.length ? 0 : 77,
                    firstBatch: matching.slice(0, size),
                },
            };
        }
        if (command.getMore) {
            const state = positions[command.collection];
            const batch = state.docs.slice(
                state.position,
                state.position + command.batchSize
            );
            state.position += batch.length;
            return {
                ok: 1,
                cursor: {
                    id: state.position >= state.docs.length ? 0 : 77,
                    nextBatch: batch,
                },
            };
        }
        throw new Error(`unexpected command ${JSON.stringify(command)}`);
    });
}

const getMoreCalls = (collection) =>
    prisma.$runCommandRaw.mock.calls.filter(
        ([c]) => c.getMore && c.collection === collection
    ).length;

beforeEach(() => jest.clearAllMocks());

describe('DocumentDB ownership lists follow the cursor', () => {
    const ownerOid = new ObjectId();
    const orgOid = new ObjectId();
    const clauses = [
        {
            userId: ownerOid.toHexString(),
            organizationId: orgOid.toHexString(),
        },
    ];

    it('findEntitiesByOwnership returns every entity, each with its credential', async () => {
        const credentials = Array.from({ length: TOTAL }, () => ({
            _id: new ObjectId(),
            userId: ownerOid,
            authIsValid: true,
            data: { accessToken: 'x' },
        }));
        const entities = credentials.map((credential, i) => ({
            _id: new ObjectId(),
            userId: ownerOid,
            organizationId: orgOid,
            credentialId: credential._id,
            moduleName: 'hubspot',
            name: `e${i}`,
            externalId: `x${i}`,
        }));
        serveCollections({ Entity: entities, Credential: credentials });

        const result =
            await new ModuleRepositoryDocumentDB().findEntitiesByOwnership(
                clauses
            );

        expect(result).toHaveLength(TOTAL);
        expect(result[TOTAL - 1].name).toBe(`e${TOTAL - 1}`);
        // The bulk credential read is drained too: every entity keeps its
        // credential, not only those in the first batch of the $in read.
        expect(result.every((e) => e.credential)).toBe(true);
        expect(getMoreCalls('Entity')).toBeGreaterThan(0);
        expect(getMoreCalls('Credential')).toBeGreaterThan(0);
    });

    it('findIntegrationsByOwnership returns every integration', async () => {
        const integrations = Array.from({ length: TOTAL }, (_, i) => ({
            _id: new ObjectId(),
            userId: ownerOid,
            organizationId: orgOid,
            entityIds: [],
            config: { type: 'sync', n: i },
            status: 'ENABLED',
            version: '1.0.0',
        }));
        serveCollections({ Integration: integrations });

        const result =
            await new IntegrationRepositoryDocumentDB().findIntegrationsByOwnership(
                clauses
            );

        expect(result).toHaveLength(TOTAL);
        expect(result[TOTAL - 1].config.n).toBe(TOTAL - 1);
        expect(getMoreCalls('Integration')).toBeGreaterThan(0);
    });
});
