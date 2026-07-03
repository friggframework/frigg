/**
 * Command-generation tests for IntegrationRepositoryDocumentDB.patchIntegrationConfig.
 *
 * Mirrors the existing updateIntegrationConfig pattern in this adapter:
 * an atomic $set update (per-key config.<k> paths here, instead of a
 * whole-config replace) followed by a read-back to shape the return
 * value — DocumentDB's $runCommandRaw update command doesn't return the
 * post-update document directly.
 */

const {
    IntegrationRepositoryDocumentDB,
} = require('./integration-repository-documentdb');

const OID = '507f1f77bcf86cd799439011';

function makeRepo({ findResult = null, updateResult = { ok: 1, n: 1, nModified: 1 } } = {}) {
    const repo = new IntegrationRepositoryDocumentDB();
    const calls = [];
    repo.prisma = {
        $runCommandRaw: jest.fn(async (command) => {
            calls.push(command);
            if (command.find) {
                return { cursor: { firstBatch: findResult ? [findResult] : [] } };
            }
            return updateResult;
        }),
    };
    return { repo, calls };
}

const FOUND_DOC = {
    _id: { $oid: OID },
    userId: { $oid: '507f191e810c19729de860ea' },
    config: { type: 'attio', attioWebhookId: 'wh_1' },
    version: '0.0.0',
    status: 'ENABLED',
    entityIds: [{ $oid: '507f1f77bcf86cd799439099' }],
};

describe('IntegrationRepositoryDocumentDB.patchIntegrationConfig', () => {
    it('issues an update with per-key $set config.<k> entries and an ObjectId filter', async () => {
        const { repo, calls } = makeRepo({ findResult: FOUND_DOC });

        await repo.patchIntegrationConfig(OID, {
            attioWebhookId: 'wh_1',
            quoWebhooksUrl: 'https://example.com',
        });

        const updateCall = calls.find((c) => c.update === 'Integration');
        expect(updateCall).toBeDefined();
        const [op] = updateCall.updates;
        expect(op.q._id).toEqual(expect.objectContaining({}));
        expect(op.u.$set['config.attioWebhookId']).toBe('wh_1');
        expect(op.u.$set['config.quoWebhooksUrl']).toBe('https://example.com');
        expect(op.u.$set.updatedAt).toBeInstanceOf(Date);
    });

    it('does not read the document before updating', async () => {
        const { calls, repo } = makeRepo({ findResult: FOUND_DOC });

        await repo.patchIntegrationConfig(OID, { attioWebhookId: 'wh_1' });

        expect(calls[0].update).toBe('Integration');
        expect(calls.some((c) => c.find)).toBe(true);
        expect(calls.findIndex((c) => c.update)).toBeLessThan(
            calls.findIndex((c) => c.find)
        );
    });

    it('returns the mapped integration after re-fetch', async () => {
        const { repo } = makeRepo({ findResult: FOUND_DOC });

        const result = await repo.patchIntegrationConfig(OID, {
            attioWebhookId: 'wh_1',
        });

        expect(result).toMatchObject({
            id: OID,
            entitiesIds: ['507f1f77bcf86cd799439099'],
            userId: '507f191e810c19729de860ea',
            config: { type: 'attio', attioWebhookId: 'wh_1' },
            version: '0.0.0',
            status: 'ENABLED',
        });
    });

    it('throws before any command for an invalid patch', async () => {
        const { repo, calls } = makeRepo();

        await expect(
            repo.patchIntegrationConfig(OID, { attioWebhookId: null })
        ).rejects.toThrow('cannot be null or undefined');
        expect(calls).toHaveLength(0);
    });

    it('throws before any command for an invalid integration id', async () => {
        const { repo, calls } = makeRepo();

        await expect(
            repo.patchIntegrationConfig('not-a-valid-id', {
                attioWebhookId: 'wh_1',
            })
        ).rejects.toThrow('Integration with id not-a-valid-id not found');
        expect(calls).toHaveLength(0);
    });

    it('throws when the document is gone after the update', async () => {
        const { repo } = makeRepo({ findResult: null });
        jest.spyOn(console, 'error').mockImplementation();

        await expect(
            repo.patchIntegrationConfig(OID, { attioWebhookId: 'wh_1' })
        ).rejects.toThrow('Document not found after update');
    });

    it('throws "not found" when the update command matches no document, without reading back', async () => {
        const { repo, calls } = makeRepo({
            updateResult: { ok: 1, n: 0, nModified: 0 },
        });

        await expect(
            repo.patchIntegrationConfig(OID, { attioWebhookId: 'wh_1' })
        ).rejects.toThrow(`Integration with id ${OID} not found`);
        expect(calls.some((c) => c.find)).toBe(false);
    });

    it('throws when the update command reports a write error, without reading back', async () => {
        const { repo, calls } = makeRepo({
            updateResult: {
                ok: 1,
                n: 0,
                nModified: 0,
                writeErrors: [{ errmsg: 'document too large' }],
            },
        });

        await expect(
            repo.patchIntegrationConfig(OID, { attioWebhookId: 'wh_1' })
        ).rejects.toThrow('document too large');
        expect(calls.some((c) => c.find)).toBe(false);
    });
});
