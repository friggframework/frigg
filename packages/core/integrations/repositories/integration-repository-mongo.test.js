/**
 * Command-generation tests for IntegrationRepositoryMongo.patchIntegrationConfig.
 *
 * Uses findAndModify via $runCommandRaw (same pattern as
 * ProcessRepositoryMongo.applyProcessUpdate) so the merge and the
 * post-update read happen in a single atomic server-side round trip —
 * entityIds is a scalar array directly on the Integration document in
 * Mongo, so no follow-up findUnique is needed to shape the return value.
 */

const {
    IntegrationRepositoryMongo,
} = require('./integration-repository-mongo');

function makeRepo({ value = null } = {}) {
    const repo = new IntegrationRepositoryMongo();
    const calls = [];
    repo.prisma = {
        $runCommandRaw: jest.fn(async (command) => {
            calls.push(command);
            return { value };
        }),
    };
    return { repo, calls };
}

const RAW_DOC = {
    _id: { $oid: '507f1f77bcf86cd799439011' },
    userId: { $oid: '507f191e810c19729de860ea' },
    config: { type: 'attio', attioWebhookId: 'wh_1' },
    version: '0.0.0',
    status: 'ENABLED',
    entityIds: [{ $oid: '507f1f77bcf86cd799439099' }],
};

describe('IntegrationRepositoryMongo.patchIntegrationConfig', () => {
    it('emits a single findAndModify with per-key $set config.<k> paths', async () => {
        const { repo, calls } = makeRepo({ value: RAW_DOC });

        await repo.patchIntegrationConfig('507f1f77bcf86cd799439011', {
            attioWebhookId: 'wh_1',
            quoWebhooksUrl: 'https://example.com',
        });

        expect(calls).toHaveLength(1);
        const cmd = calls[0];
        expect(cmd.findAndModify).toBe('Integration');
        expect(cmd.query).toEqual({ _id: { $oid: '507f1f77bcf86cd799439011' } });
        expect(cmd.update.$set['config.attioWebhookId']).toBe('wh_1');
        expect(cmd.update.$set['config.quoWebhooksUrl']).toBe(
            'https://example.com'
        );
        expect(cmd.new).toBe(true);
    });

    it('stamps updatedAt as a Date in the same command', async () => {
        const { repo, calls } = makeRepo({ value: RAW_DOC });

        await repo.patchIntegrationConfig('507f1f77bcf86cd799439011', {
            attioWebhookId: 'wh_1',
        });

        expect(calls[0].update.$set.updatedAt).toBeInstanceOf(Date);
    });

    it('performs no read before the update command', async () => {
        const { repo, calls } = makeRepo({ value: RAW_DOC });
        repo.findIntegrationById = jest.fn();

        await repo.patchIntegrationConfig('507f1f77bcf86cd799439011', {
            attioWebhookId: 'wh_1',
        });

        expect(repo.findIntegrationById).not.toHaveBeenCalled();
        expect(calls).toHaveLength(1);
    });

    it('throws when no document matches', async () => {
        const { repo } = makeRepo({ value: null });

        await expect(
            repo.patchIntegrationConfig('507f1f77bcf86cd799439011', {
                attioWebhookId: 'wh_1',
            })
        ).rejects.toThrow(
            'Integration with id 507f1f77bcf86cd799439011 not found'
        );
    });

    it('throws before issuing any command for an invalid patch', async () => {
        const { repo, calls } = makeRepo();

        await expect(
            repo.patchIntegrationConfig('507f1f77bcf86cd799439011', {
                'bad.key': 'x',
            })
        ).rejects.toThrow("cannot contain '.' or start with '$'");
        expect(calls).toHaveLength(0);
    });

    it('sets a null value via $set (clears the field)', async () => {
        const { repo, calls } = makeRepo({ value: RAW_DOC });

        await repo.patchIntegrationConfig('507f1f77bcf86cd799439011', {
            lastBillingErrorAt: null,
        });

        expect(calls[0].update.$set['config.lastBillingErrorAt']).toBeNull();
    });

    it('returns the standard mapped integration shape after the write', async () => {
        const { repo } = makeRepo({ value: RAW_DOC });

        const result = await repo.patchIntegrationConfig(
            '507f1f77bcf86cd799439011',
            { attioWebhookId: 'wh_1' }
        );

        expect(result).toEqual({
            id: '507f1f77bcf86cd799439011',
            entitiesIds: ['507f1f77bcf86cd799439099'],
            userId: '507f191e810c19729de860ea',
            config: { type: 'attio', attioWebhookId: 'wh_1' },
            version: '0.0.0',
            status: 'ENABLED',
            messages: undefined,
        });
    });
});
