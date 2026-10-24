const { DispatchOngoingSyncs } = require('./dispatch-ongoing-syncs');

const QUEUE_ID = '/.netlify/functions/worker-background';
const NOW = new Date('2026-10-19T12:00:00Z');

function integrationClass(name, schedule, { ongoing = true } = {}) {
    class Integration {}
    Integration.Definition = { name, schedule };
    if (ongoing) Integration.prototype.startOngoingSync = function () {};
    return Integration;
}

function setup(records = {}) {
    const sent = [];
    const queueProvider = {
        send: jest.fn(async (message, queueId) => {
            if (message.data?.integrationId === 'boom') throw new Error('queue down');
            sent.push({ message, queueId });
        }),
    };
    const integrationRepository = {
        findIntegrations: jest.fn(async ({ type }) => records[type] || []),
    };
    const logger = { error: jest.fn() };
    const useCase = new DispatchOngoingSyncs({
        integrationRepository,
        queueProvider,
        queueId: QUEUE_ID,
        now: () => NOW,
        logger,
    });
    return { useCase, sent, queueProvider, integrationRepository, logger };
}

describe('DispatchOngoingSyncs', () => {
    it("scope 'class' (the default): one message per class, no integration id, no database read", async () => {
        const { useCase, sent, integrationRepository } = setup();
        const result = await useCase.execute([
            integrationClass('crm'),
            integrationClass('erp', { scope: 'class' }),
        ]);

        expect(sent).toEqual([
            { message: { integrationName: 'crm', event: 'ONGOING_SYNC', data: {} }, queueId: QUEUE_ID },
            { message: { integrationName: 'erp', event: 'ONGOING_SYNC', data: {} }, queueId: QUEUE_ID },
        ]);
        expect(integrationRepository.findIntegrations).not.toHaveBeenCalled();
        expect(result).toEqual({ dispatched: 2, notDue: 0, errors: 0 });
    });

    it("scope 'installation': one message per ENABLED record, carrying its id so the worker hydrates it", async () => {
        const { useCase, sent, integrationRepository } = setup({
            crm: [{ id: 'i-1' }, { id: 'i-2' }],
        });
        const result = await useCase.execute([integrationClass('crm', { scope: 'installation' })]);

        expect(integrationRepository.findIntegrations).toHaveBeenCalledWith({
            type: 'crm',
            status: 'ENABLED',
        });
        expect(sent.map((s) => s.message)).toEqual([
            { integrationName: 'crm', event: 'ONGOING_SYNC', data: { integrationId: 'i-1' } },
            { integrationName: 'crm', event: 'ONGOING_SYNC', data: { integrationId: 'i-2' } },
        ]);
        expect(result).toEqual({ dispatched: 2, notDue: 0, errors: 0 });
    });

    it('respects the definition due check, given the record and the tick time', async () => {
        // Only an explicit true dispatches: a truthy 'yes' is not a yes.
        const isDue = jest.fn(async (integration) => integration.config.due);
        const { useCase, sent } = setup({
            crm: [
                { id: 'due', config: { due: true } },
                { id: 'later', config: { due: false } },
                { id: 'truthy', config: { due: 'yes' } },
            ],
        });
        const result = await useCase.execute([
            integrationClass('crm', { scope: 'installation', isDue }),
        ]);

        expect(isDue).toHaveBeenCalledWith({ id: 'due', config: { due: true } }, { now: NOW });
        expect(sent.map((s) => s.message.data.integrationId)).toEqual(['due']);
        expect(result).toEqual({ dispatched: 1, notDue: 2, errors: 0 });
    });

    it('skips classes without startOngoingSync or a name', async () => {
        const { useCase, sent } = setup({ crm: [{ id: 'i-1' }] });
        await useCase.execute([
            integrationClass('crm', { scope: 'installation' }, { ongoing: false }),
            integrationClass(undefined),
        ]);
        expect(sent).toEqual([]);
    });

    it('counts a failed installation (send or due check) and still dispatches the rest', async () => {
        const { useCase, sent, logger } = setup({
            crm: [{ id: 'boom' }, { id: 'i-2' }],
            erp: [{ id: 'e-1' }],
        });
        const result = await useCase.execute([
            integrationClass('crm', { scope: 'installation' }),
            integrationClass('erp', {
                scope: 'installation',
                isDue: () => {
                    throw new Error('bad check');
                },
            }),
            integrationClass('hr'),
        ]);

        expect(sent.map((s) => `${s.message.integrationName}:${s.message.data.integrationId ?? '-'}`)).toEqual([
            'crm:i-2',
            'hr:-',
        ]);
        expect(result).toEqual({ dispatched: 2, notDue: 0, errors: 2 });
        expect(logger.error).toHaveBeenCalledTimes(2);
    });

    it('counts a class whose records cannot be read and moves on', async () => {
        const { useCase, sent, integrationRepository } = setup();
        integrationRepository.findIntegrations.mockRejectedValueOnce(new Error('db down'));
        const result = await useCase.execute([
            integrationClass('crm', { scope: 'installation' }),
            integrationClass('hr'),
        ]);
        expect(sent.map((s) => s.message.integrationName)).toEqual(['hr']);
        expect(result).toEqual({ dispatched: 1, notDue: 0, errors: 1 });
    });
});
