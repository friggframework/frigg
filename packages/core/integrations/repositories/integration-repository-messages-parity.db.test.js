/**
 * appendRateLimitMessage / updateIntegrationMessages / findIntegrationMessages
 * against real databases. Every case runs through each adapter.
 *
 * Skipped unless a database URL is set:
 * - INTEGRATION_MESSAGES_PARITY_MONGO_URL (a replica set) runs the MongoDB
 *   and the DocumentDB adapters against MongoDB.
 * - INTEGRATION_MESSAGES_PARITY_POSTGRES_URL (schema pushed from
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

const MONGO_URL = process.env.INTEGRATION_MESSAGES_PARITY_MONGO_URL;
const POSTGRES_URL = process.env.INTEGRATION_MESSAGES_PARITY_POSTGRES_URL;

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

const RETRY_AT = Date.parse('2026-09-28T13:00:00.000Z');
const SECOND = 1_000;
const iso = (ms) => new Date(ms).toISOString();

const rateLimited = ({ module = 'hubspot', retryAt = RETRY_AT } = {}) => ({
    title: 'Rate limit reached',
    message: `The ${module} API rate limit was reached.`,
    timestamp: 1_000,
    code: 'RATE_LIMITED',
    module,
    reason: 'daily',
    retryAt: iso(retryAt),
    actions: [
        { type: 'RETRY_WHEN_READY' },
        { type: 'LINK', label: 'Limits', url: 'https://example.com/limits' },
    ],
});

const sameLimitWindow = (item) => ({
    retryAtFrom: iso(Date.parse(item.retryAt) - 60 * SECOND),
    retryAtTo: iso(Date.parse(item.retryAt) + 60 * SECOND),
    keepLast: 50,
});

describeLegs('integration messages on %s', (_, makeClient, Repository) => {
    let client;
    let repo;
    let userId;
    const created = { integrations: [], users: [] };

    const append = (integrationId, item) =>
        repo.appendRateLimitMessage(
            integrationId,
            'warnings',
            item,
            sameLimitWindow(item)
        );

    const warnings = (integrationId) =>
        repo.findIntegrationMessages(integrationId, 'warnings');

    async function createIntegration() {
        const integration = await repo.createIntegration([], userId, {
            type: 'parity-type',
        });
        created.integrations.push(integration.id);
        return integration.id.toString();
    }

    beforeAll(async () => {
        client = makeClient();
        repo = new Repository();
        repo.prisma = client;
        const user = await client.user.create({
            data: {
                type: 'INDIVIDUAL',
                username: `messages-parity-${process.pid}`,
            },
        });
        created.users.push(user.id);
        userId = user.id.toString();
    });

    afterAll(async () => {
        for (const integrationId of created.integrations) {
            await repo.deleteIntegrationById(integrationId).catch(() => {});
        }
        await client.user
            .deleteMany({ where: { id: { in: created.users } } })
            .catch(() => {});
        await client.$disconnect();
    });

    it('appends a rate-limit message and reads it back as it was written', async () => {
        const integrationId = await createIntegration();
        const item = rateLimited();

        await expect(append(integrationId, item)).resolves.toBe(true);

        expect(await warnings(integrationId)).toEqual([item]);
    });

    it('writes nothing for the same code and module with a retryAt within 60 s', async () => {
        const integrationId = await createIntegration();
        const first = rateLimited();

        await append(integrationId, first);
        const second = await append(
            integrationId,
            rateLimited({ retryAt: RETRY_AT + 59 * SECOND })
        );

        expect(second).toBe(false);
        expect(await warnings(integrationId)).toEqual([first]);
    });

    it('appends for another module, or for a retryAt more than 60 s away', async () => {
        const integrationId = await createIntegration();
        const first = rateLimited();
        const otherModule = rateLimited({ module: 'salesforce' });
        const later = rateLimited({ retryAt: RETRY_AT + 61 * SECOND });

        await append(integrationId, first);
        await append(integrationId, otherModule);
        await append(integrationId, later);

        expect(await warnings(integrationId)).toEqual([
            first,
            otherModule,
            later,
        ]);
    });

    it('keeps the warnings that were stored before', async () => {
        const integrationId = await createIntegration();
        const stored = { title: 'Old', message: 'stored', timestamp: 1 };
        await repo.updateIntegrationMessages(integrationId, 'warnings', stored, {
            keepLast: 50,
        });
        const item = rateLimited();

        await append(integrationId, item);

        expect(await warnings(integrationId)).toEqual([stored, item]);
    });

    it('keeps the newest 50 warnings, oldest first', async () => {
        const integrationId = await createIntegration();

        for (let n = 1; n <= 51; n++) {
            await append(
                integrationId,
                rateLimited({ retryAt: RETRY_AT + n * 10 * 60 * SECOND })
            );
        }

        const stored = await warnings(integrationId);
        expect(stored).toHaveLength(50);
        expect(stored[0].retryAt).toBe(iso(RETRY_AT + 2 * 10 * 60 * SECOND));
        expect(stored[49].retryAt).toBe(iso(RETRY_AT + 51 * 10 * 60 * SECOND));
    });

    it('stores one message when twenty workers write the same limit at once', async () => {
        const integrationId = await createIntegration();

        const results = await Promise.all(
            Array.from({ length: 20 }, (_, n) =>
                append(integrationId, rateLimited({ retryAt: RETRY_AT + n * SECOND }))
            )
        );

        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await warnings(integrationId)).toHaveLength(1);
    });

    it('writes nothing for an integration that does not exist', async () => {
        const unknownId =
            Repository === IntegrationRepositoryPostgres
                ? '999999999'
                : '0123456789abcdef01234567';

        await expect(append(unknownId, rateLimited())).resolves.toBe(false);
    });

    it('appends with updateIntegrationMessages, and keeps the newest 50', async () => {
        const integrationId = await createIntegration();

        for (let n = 1; n <= 51; n++) {
            await repo.updateIntegrationMessages(
                integrationId,
                'warnings',
                { title: `W${n}`, message: 'body', timestamp: n },
                { keepLast: 50 }
            );
        }

        const stored = await warnings(integrationId);
        expect(stored.map((item) => item.timestamp)).toEqual(
            Array.from({ length: 50 }, (_, i) => i + 2)
        );
    });
});
