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
            repo.patchIntegrationConfig(OID, { 'bad.key': 'x' })
        ).rejects.toThrow("cannot contain '.' or start with '$'");
        expect(calls).toHaveLength(0);
    });

    it('sets a null value via $set (clears the field)', async () => {
        const { repo, calls } = makeRepo({ findResult: FOUND_DOC });

        await repo.patchIntegrationConfig(OID, { lastBillingErrorAt: null });

        const updateCall = calls.find((c) => c.update === 'Integration');
        const [op] = updateCall.updates;
        expect(op.u.$set['config.lastBillingErrorAt']).toBeNull();
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

describe('IntegrationRepositoryDocumentDB.createIntegration', () => {
    it('inserts new integrations with status IN_CREATION', async () => {
        const repo = new IntegrationRepositoryDocumentDB();
        const insertedDoc = { ...FOUND_DOC, status: 'IN_CREATION' };
        const calls = [];
        repo.prisma = {
            $runCommandRaw: jest.fn(async (command) => {
                calls.push(command);
                if (command.insert) {
                    return { ok: 1, n: 1 };
                }
                return { cursor: { firstBatch: [insertedDoc] } };
            }),
        };

        await repo.createIntegration(['507f1f77bcf86cd799439099'], OID, {
            type: 'attio',
        });

        const insertCall = calls.find((c) => c.insert === 'Integration');
        expect(insertCall.documents[0].status).toBe('IN_CREATION');
    });
});

describe('IntegrationRepositoryDocumentDB.updateIntegrationMessages', () => {
    function makeMessagesRepo(stored = {}) {
        const doc = {
            _id: { $oid: OID },
            messages: { errors: [], warnings: [], info: [], logs: [] },
            errors: [],
            warnings: [],
            info: [],
            logs: [],
            ...stored,
        };
        const repo = new IntegrationRepositoryDocumentDB();
        repo.prisma = {
            $runCommandRaw: jest.fn(async (command) => {
                if (command.find) {
                    return { cursor: { firstBatch: [{ ...doc }] } };
                }
                Object.assign(doc, command.updates[0].u.$set);
                return { ok: 1, n: 1, nModified: 1 };
            }),
        };
        return { repo, doc };
    }

    it('appends, so two calls leave two items in both stored copies', async () => {
        const { repo, doc } = makeMessagesRepo();

        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            'First',
            'one',
            1000
        );
        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            'Second',
            'two',
            2000
        );

        const expected = [
            { title: 'First', message: 'one', timestamp: 1000 },
            { title: 'Second', message: 'two', timestamp: 2000 },
        ];
        expect(doc.messages.warnings).toEqual(expected);
        expect(doc.warnings).toEqual(expected);
    });

    it('appends to the items of a document that has no messages object', async () => {
        const stored = { title: 'Old', message: 'stored', timestamp: 1 };
        const { repo, doc } = makeMessagesRepo({
            messages: undefined,
            warnings: [stored],
        });

        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            'New',
            'added',
            2
        );

        expect(doc.warnings).toEqual([
            stored,
            { title: 'New', message: 'added', timestamp: 2 },
        ]);
    });

    it('keeps the items of the other types', async () => {
        const error = { title: 'Kept', message: 'error', timestamp: 1 };
        const { repo, doc } = makeMessagesRepo({
            messages: { errors: [error], warnings: [], info: [], logs: [] },
            errors: [error],
        });

        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            'Title',
            'body',
            2
        );

        expect(doc.messages.errors).toEqual([error]);
        expect(doc.errors).toEqual([error]);
    });

    it('throws when the integration id is not valid', async () => {
        const { repo } = makeMessagesRepo();

        await expect(
            repo.updateIntegrationMessages(
                'nope',
                'warnings',
                'Title',
                'body',
                2
            )
        ).rejects.toThrow('Integration nope not found');
        expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('stores an item object with its extra keys in both stored copies', async () => {
        const { repo, doc } = makeMessagesRepo();
        const item = {
            title: 'Rate limit reached',
            message: 'It resets at noon.',
            timestamp: 1000,
            code: 'RATE_LIMITED',
            actions: [{ type: 'RETRY_WHEN_READY' }],
        };

        await repo.updateIntegrationMessages(OID, 'warnings', item);

        expect(doc.messages.warnings).toEqual([item]);
        expect(doc.warnings).toEqual([item]);
    });

    it('appends an item object after a positional message', async () => {
        const { repo, doc } = makeMessagesRepo();
        const item = {
            title: 'Item',
            message: 'object',
            timestamp: 2,
            code: 'X',
        };

        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            'First',
            'one',
            1
        );
        await repo.updateIntegrationMessages(OID, 'warnings', item);

        expect(doc.warnings).toEqual([
            { title: 'First', message: 'one', timestamp: 1 },
            item,
        ]);
    });
});
