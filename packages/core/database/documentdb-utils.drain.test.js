/**
 * Tests for the cursor-draining helpers hoisted into documentdb-utils.
 * These back the deployment-wide report reads (integration/mapping/credential
 * DocumentDB adapters) that must NOT truncate at the ~101-doc first batch.
 */
const { findManyDrained, aggregateDrained } = require('./documentdb-utils');

function clientReturning(...responses) {
    const calls = [];
    const $runCommandRaw = jest.fn(async (command) => {
        calls.push(command);
        return responses[calls.length - 1];
    });
    return { client: { $runCommandRaw }, calls };
}

describe('findManyDrained', () => {
    it('drains multiple batches via getMore until the cursor closes', async () => {
        const { client, calls } = clientReturning(
            { cursor: { id: 7, firstBatch: [{ _id: 'a' }, { _id: 'b' }] } },
            { cursor: { id: 7, nextBatch: [{ _id: 'c' }] } },
            { cursor: { id: 0, nextBatch: [{ _id: 'd' }] } }
        );

        const docs = await findManyDrained(client, 'Credential', {
            updatedAt: { $gte: new Date('2026-01-01') },
        });

        expect(docs.map((d) => d._id)).toEqual(['a', 'b', 'c', 'd']);
        expect(calls[0]).toMatchObject({ find: 'Credential', batchSize: 1000 });
        expect(calls[1]).toMatchObject({ getMore: 7, collection: 'Credential' });
    });

    it('forwards a projection and stops on an empty batch', async () => {
        const { client, calls } = clientReturning(
            { cursor: { id: 9, firstBatch: [{ _id: 'a' }] } },
            { cursor: { id: 9, nextBatch: [] } }
        );

        const docs = await findManyDrained(
            client,
            'Credential',
            {},
            { projection: { _id: 1 } }
        );

        expect(docs).toHaveLength(1);
        expect(calls[0].projection).toEqual({ _id: 1 });
    });

    it('treats an extended-JSON {$numberLong} cursor id as open', async () => {
        const { client } = clientReturning(
            {
                cursor: {
                    id: { $numberLong: '9007199254740993' },
                    firstBatch: [{ _id: 'a' }],
                },
            },
            { cursor: { id: { $numberLong: '0' }, nextBatch: [{ _id: 'b' }] } }
        );

        const docs = await findManyDrained(client, 'Credential', {});
        expect(docs).toHaveLength(2);
    });

    it('does not call getMore when the first batch closes the cursor', async () => {
        const { client, calls } = clientReturning({
            cursor: { id: 0, firstBatch: [{ _id: 'only' }] },
        });

        const docs = await findManyDrained(client, 'Credential', {});
        expect(docs).toHaveLength(1);
        expect(calls).toHaveLength(1);
    });
});

describe('aggregateDrained', () => {
    it('drains grouped aggregation results across batches', async () => {
        const { client, calls } = clientReturning(
            { cursor: { id: 3, firstBatch: [{ _id: '1', count: 2 }] } },
            { cursor: { id: 0, nextBatch: [{ _id: '2', count: 5 }] } }
        );

        const rows = await aggregateDrained(client, 'IntegrationMapping', [
            { $group: { _id: '$integrationId', count: { $sum: 1 } } },
        ]);

        expect(rows).toEqual([
            { _id: '1', count: 2 },
            { _id: '2', count: 5 },
        ]);
        expect(calls[0]).toMatchObject({
            aggregate: 'IntegrationMapping',
            cursor: { batchSize: 1000 },
        });
    });
});
