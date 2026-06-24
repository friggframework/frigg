jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { UserActionWorker } = require('./user-action-worker');

const sqsEventFor = (params) => ({
    Records: [
        { messageId: 'm-1', body: JSON.stringify(params), attributes: {} },
    ],
});

const makeInstance = (overrides = {}) => ({
    id: 'int-1',
    status: 'ENABLED',
    send: jest.fn().mockResolvedValue({ ok: true }),
    updateIntegrationStatus: { execute: jest.fn().mockResolvedValue({}) },
    updateIntegrationMessages: { execute: jest.fn().mockResolvedValue({}) },
    ...overrides,
});

const workerWith = (instanceOrError) => {
    const execute = jest.fn(async () => {
        if (instanceOrError instanceof Error) throw instanceOrError;
        return instanceOrError;
    });
    const worker = new UserActionWorker({
        getIntegrationInstance: { execute },
    });
    return { worker, execute };
};

describe('UserActionWorker', () => {
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // Mirrors the producer envelope: routing metadata top-level, `data` is the payload.
    const envelope = ({
        event = 'ON_UPDATE',
        integrationId = 'int-1',
        userId = 'user-1',
        requestId = 'r-1',
        data = {},
    }) => ({ schemaVersion: 1, event, integrationId, userId, requestId, data });

    const terminalError = (message) => {
        const err = new Error(message);
        err.isTerminal = true;
        return err;
    };

    it('resolves by id+userId and runs send(event, data) with the BYTE-IDENTICAL handler payload', async () => {
        const instance = makeInstance();
        const { worker, execute } = workerWith(instance);

        const result = await worker.run(
            sqsEventFor(
                envelope({ event: 'ON_UPDATE', data: { config: { a: 1 } } })
            ),
            {}
        );

        expect(execute).toHaveBeenCalledWith('int-1', 'user-1');
        // Handler gets only the original payload — no routing keys leaked.
        expect(instance.send).toHaveBeenCalledWith('ON_UPDATE', {
            config: { a: 1 },
        });
        expect(result).toEqual({ batchItemFailures: [] });
    });

    it('processes DISABLED/ERROR integrations (no discard)', async () => {
        const instance = makeInstance({ status: 'ERROR' });
        const { worker } = workerWith(instance);

        await worker.run(sqsEventFor(envelope({})), {});

        expect(instance.send).toHaveBeenCalled();
    });

    it('discards (HaltError) when integrationId/userId are missing — no retry', async () => {
        const { worker, execute } = workerWith(makeInstance());

        const result = await worker.run(
            sqsEventFor({
                schemaVersion: 1,
                event: 'ON_UPDATE',
                data: { config: {} },
            }),
            {}
        );

        expect(execute).not.toHaveBeenCalled();
        expect(result).toEqual({ batchItemFailures: [] }); // halted = discarded
    });

    it('discards (HaltError) on a TERMINAL hydration failure (gone / not owned)', async () => {
        const { worker } = workerWith(terminalError('No integration found'));

        const result = await worker.run(
            sqsEventFor(envelope({ integrationId: 'gone' })),
            {}
        );

        expect(result).toEqual({ batchItemFailures: [] }); // halted = discarded
    });

    it('RETRIES (batch failure) on a TRANSIENT hydration failure — not discarded', async () => {
        // No isTerminal marker → a DB/KMS blip must retry, not be silently lost.
        const { worker } = workerWith(new Error('ECONNRESET'));

        const result = await worker.run(
            sqsEventFor(envelope({ integrationId: 'int-1' })),
            {}
        );

        expect(result).toEqual({
            batchItemFailures: [{ itemIdentifier: 'm-1' }],
        });
    });

    it('discards (HaltError) on hydrated-id mismatch', async () => {
        const instance = makeInstance({ id: 'different-id' });
        const { worker } = workerWith(instance);

        const result = await worker.run(
            sqsEventFor(envelope({ integrationId: 'int-1' })),
            {}
        );

        expect(instance.send).not.toHaveBeenCalled();
        expect(result).toEqual({ batchItemFailures: [] });
    });

    it('on handler failure: records ERROR status + warning message and retries (batch failure)', async () => {
        const instance = makeInstance({
            send: jest.fn().mockRejectedValue(new Error('reconcile boom')),
        });
        const { worker } = workerWith(instance);

        const result = await worker.run(
            sqsEventFor(envelope({ integrationId: 'int-1' })),
            {}
        );

        expect(instance.updateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
        expect(instance.updateIntegrationMessages.execute).toHaveBeenCalledWith(
            'int-1',
            'warnings',
            expect.any(String),
            'reconcile boom',
            expect.any(String)
        );
        expect(result).toEqual({
            batchItemFailures: [{ itemIdentifier: 'm-1' }],
        });
    });
});
