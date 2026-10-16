/**
 * addEntitiesToIntegration / removeEntitiesFromIntegration against real
 * databases. Every case runs through each adapter.
 *
 * Skipped unless a database URL is set:
 * - INTEGRATION_ENTITIES_PARITY_MONGO_URL (a replica set) runs the MongoDB
 *   and the DocumentDB adapters against MongoDB.
 * - INTEGRATION_ENTITIES_PARITY_POSTGRES_URL (schema pushed from
 *   prisma-postgresql) runs the PostgreSQL adapter.
 */

const {
    IntegrationRepositoryMongo,
} = require('./integration-repository-mongo');
const {
    IntegrationRepositoryDocumentDB,
} = require('./integration-repository-documentdb');
const {
    IntegrationRepositoryPostgres,
} = require('./integration-repository-postgres');

const MONGO_URL = process.env.INTEGRATION_ENTITIES_PARITY_MONGO_URL;
const POSTGRES_URL = process.env.INTEGRATION_ENTITIES_PARITY_POSTGRES_URL;

function mongoClient() {
    const { PrismaClient } = require('../../generated/prisma-mongodb');
    return new PrismaClient({ datasourceUrl: MONGO_URL });
}

function postgresClient() {
    const { PrismaClient } = require('../../generated/prisma-postgresql');
    return new PrismaClient({ datasourceUrl: POSTGRES_URL });
}

const LEGS = [
    MONGO_URL && ['MongoDB', mongoClient, IntegrationRepositoryMongo],
    MONGO_URL && [
        'DocumentDB (on MongoDB)',
        mongoClient,
        IntegrationRepositoryDocumentDB,
    ],
    POSTGRES_URL && [
        'PostgreSQL',
        postgresClient,
        IntegrationRepositoryPostgres,
    ],
].filter(Boolean);

const describeLegs = LEGS.length
    ? describe.each(LEGS)
    : describe.skip.each([['no database URL set', null, null]]);

describeLegs('integration entities on %s', (_, makeClient, Repository) => {
    let client;
    let repo;
    let userId;
    let rawUserId;
    let entityIds;
    const created = { integrations: [], entities: [], users: [] };

    const id = (record) => record.id.toString();
    const rawId = (value) =>
        Repository === IntegrationRepositoryPostgres ? Number(value) : value;

    const unknownIntegrationId = () =>
        Repository === IntegrationRepositoryPostgres
            ? '999999999'
            : '0123456789abcdef01234567';

    // The DocumentDB adapter writes through raw commands and reads them back
    // the same way, so its stored updatedAt is checked on the raw document.
    async function storedUpdatedAtIsDate(integrationId) {
        if (Repository === IntegrationRepositoryDocumentDB) {
            const result = await client.$runCommandRaw({
                find: 'Integration',
                filter: { _id: integrationId },
                limit: 1,
            });
            return Boolean(result.cursor.firstBatch[0]?.updatedAt?.$date);
        }
        const row = await client.integration.findUnique({
            where: { id: rawId(integrationId) },
            select: { updatedAt: true },
        });
        return row.updatedAt instanceof Date;
    }

    async function createEntity(externalId) {
        const entity = await client.entity.create({
            data: {
                userId: rawUserId,
                externalId,
                moduleName: 'parity-module',
            },
        });
        created.entities.push(entity.id);
        return id(entity);
    }

    async function createIntegration(entities) {
        const integration = await repo.createIntegration(entities, userId, {
            type: 'parity-type',
        });
        created.integrations.push(integration.id);
        return integration;
    }

    beforeAll(async () => {
        client = makeClient();
        repo = new Repository();
        repo.prisma = client;
        const user = await client.user.create({
            data: { type: 'INDIVIDUAL', username: `parity-${process.pid}` },
        });
        created.users.push(user.id);
        rawUserId = user.id;
        userId = id(user);
        entityIds = [];
        for (const externalId of ['a', 'b', 'c']) {
            entityIds.push(await createEntity(`${externalId}-${process.pid}`));
        }
    });

    afterAll(async () => {
        for (const integrationId of created.integrations) {
            await repo.deleteIntegrationById(integrationId).catch(() => {});
        }
        await client.entity
            .deleteMany({ where: { id: { in: created.entities } } })
            .catch(() => {});
        await client.user
            .deleteMany({ where: { id: { in: created.users } } })
            .catch(() => {});
        await client.$disconnect();
    });

    it('addEntitiesToIntegration attaches entities to an existing integration', async () => {
        const [first, second, third] = entityIds;
        const integration = await createIntegration([first]);

        const updated = await repo.addEntitiesToIntegration(integration.id, [
            second,
            third,
        ]);

        expect([...updated.entitiesIds].sort()).toEqual(
            [first, second, third].sort()
        );
        const reloaded = await repo.findIntegrationById(integration.id);
        expect([...reloaded.entitiesIds].sort()).toEqual(
            [first, second, third].sort()
        );
    });

    it('an attached entity resolves to its integration', async () => {
        const [first, second] = entityIds;
        const integration = await createIntegration([first]);

        await repo.addEntitiesToIntegration(integration.id, [second]);

        const owners = await repo.findIntegrationsByEntityId(second);
        expect(owners.map((o) => o.id.toString())).toContain(
            integration.id.toString()
        );
    });

    it('re-attaching an attached entity keeps a single reference', async () => {
        const [first, second] = entityIds;
        const integration = await createIntegration([first, second]);

        const updated = await repo.addEntitiesToIntegration(integration.id, [
            second,
        ]);

        expect([...updated.entitiesIds].sort()).toEqual([first, second].sort());
    });

    it('addEntitiesToIntegration returns null for an unknown integration', async () => {
        const unknownId = unknownIntegrationId();

        const result = await repo.addEntitiesToIntegration(unknownId, [
            entityIds[0],
        ]);

        expect(result).toBeNull();
    });

    it('removeEntitiesFromIntegration detaches entities and they stop resolving', async () => {
        const [first, second, third] = entityIds;
        const integration = await createIntegration([first, second, third]);

        const updated = await repo.removeEntitiesFromIntegration(
            integration.id,
            [second]
        );

        expect([...updated.entitiesIds].sort()).toEqual([first, third].sort());
        const owners = await repo.findIntegrationsByEntityId(second);
        expect(owners.map((o) => o.id.toString())).not.toContain(
            integration.id.toString()
        );
    });

    it('removing an entity that is not attached changes nothing', async () => {
        const [first, second, third] = entityIds;
        const integration = await createIntegration([first, second]);

        const updated = await repo.removeEntitiesFromIntegration(
            integration.id,
            [third]
        );

        expect([...updated.entitiesIds].sort()).toEqual([first, second].sort());
    });

    it('removeEntitiesFromIntegration returns null for an unknown integration', async () => {
        const unknownId = unknownIntegrationId();

        const result = await repo.removeEntitiesFromIntegration(unknownId, [
            entityIds[0],
        ]);

        expect(result).toBeNull();
    });

    it.each(['addEntitiesToIntegration', 'removeEntitiesFromIntegration'])(
        '%s stores updatedAt as a date',
        async (method) => {
            const [first, second] = entityIds;
            const integration = await createIntegration([first]);

            await repo[method](integration.id, [second]);

            expect(await storedUpdatedAtIsDate(integration.id)).toBe(true);
        }
    );
});
