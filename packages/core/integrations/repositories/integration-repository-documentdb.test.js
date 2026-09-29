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

describe('IntegrationRepositoryDocumentDB.updateIntegrationMessages', () => {
    const first = { title: 'First', message: 'one', timestamp: 1000 };
    const second = { title: 'Second', message: 'two', timestamp: 2000 };
    const keepNewest50 = { keepLast: 50 };

    it('appends, so two calls leave two items in both stored copies', async () => {
        const { repo, doc } = makeMessagesRepo();

        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            first,
            keepNewest50
        );
        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            second,
            keepNewest50
        );

        expect(doc.messages.warnings).toEqual([first, second]);
        expect(doc.warnings).toEqual([first, second]);
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
            first,
            keepNewest50
        );

        expect(doc.warnings).toEqual([stored, first]);
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
            first,
            keepNewest50
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
                first,
                keepNewest50
            )
        ).rejects.toThrow('Integration nope not found');
        expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('stores the item with its extra keys in both stored copies', async () => {
        const { repo, doc } = makeMessagesRepo();
        const item = {
            title: 'Rate limit reached',
            message: 'It resets at noon.',
            timestamp: 1000,
            code: 'RATE_LIMITED',
            actions: [{ type: 'RETRY_WHEN_READY' }],
        };

        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            item,
            keepNewest50
        );

        expect(doc.messages.warnings).toEqual([item]);
        expect(doc.warnings).toEqual([item]);
    });

    it('stores null for an item that has no title', async () => {
        const { repo, doc } = makeMessagesRepo();

        await repo.updateIntegrationMessages(
            OID,
            'warnings',
            { message: 'untitled', timestamp: 1 },
            keepNewest50
        );

        expect(doc.warnings).toEqual([
            { title: null, message: 'untitled', timestamp: 1 },
        ]);
    });

    it('keeps the newest 50 items of the type, oldest first', async () => {
        const { repo, doc } = makeMessagesRepo();

        for (let n = 1; n <= 51; n++) {
            await repo.updateIntegrationMessages(
                OID,
                'warnings',
                { title: `W${n}`, message: 'b', timestamp: n },
                keepNewest50
            );
        }

        expect(doc.messages.warnings.map((item) => item.timestamp)).toEqual(
            Array.from({ length: 50 }, (_, i) => i + 2)
        );
        expect(doc.warnings.map((item) => item.timestamp)).toEqual(
            Array.from({ length: 50 }, (_, i) => i + 2)
        );
    });
});

describe('IntegrationRepositoryDocumentDB.findIntegrationMessages', () => {
    const stored = { title: 'Stored', message: 'warning', timestamp: 1 };

    it('returns the stored items of the type', async () => {
        const { repo } = makeMessagesRepo({
            messages: { errors: [], warnings: [stored], info: [], logs: [] },
        });

        await expect(
            repo.findIntegrationMessages(OID, 'warnings')
        ).resolves.toEqual([stored]);
    });

    it('reads the column of a document that has no messages object', async () => {
        const { repo } = makeMessagesRepo({
            messages: undefined,
            warnings: [stored],
        });

        await expect(
            repo.findIntegrationMessages(OID, 'warnings')
        ).resolves.toEqual([stored]);
    });

    it('returns an empty list when nothing is stored', async () => {
        const { repo } = makeMessagesRepo({
            messages: undefined,
            warnings: undefined,
        });

        await expect(
            repo.findIntegrationMessages(OID, 'warnings')
        ).resolves.toEqual([]);
    });

    it('throws when the integration id is not valid', async () => {
        const { repo } = makeMessagesRepo();

        await expect(
            repo.findIntegrationMessages('nope', 'warnings')
        ).rejects.toThrow('Integration nope not found');
        expect(repo.prisma.$runCommandRaw).not.toHaveBeenCalled();
    });

    it('throws when the integration does not exist', async () => {
        const { repo } = makeMessagesRepo();
        repo.prisma.$runCommandRaw.mockResolvedValue({
            cursor: { firstBatch: [] },
        });

        await expect(
            repo.findIntegrationMessages(OID, 'warnings')
        ).rejects.toThrow(`Integration ${OID} not found`);
    });
});
