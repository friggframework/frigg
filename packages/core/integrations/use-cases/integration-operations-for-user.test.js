const {
    GetOwnedIntegrationRecord,
    CreateIntegrationForUser,
    GetIntegrationInstanceForUser,
    UpdateIntegrationForUser,
    RemoveIntegrationForUser,
    SendIntegrationEventForUser,
    RunIntegrationActionForUser,
    TestIntegrationAuthForUser,
} = require('./integration-operations-for-user');

const user = { getId: () => 'u1' };
const record = { id: 'i1', userId: 'u1', config: { type: 'sync' } };

function deps({ found = record } = {}) {
    const integrationRepository = {
        findIntegrationById: jest.fn(async (id) => (id === 'i1' ? found : null)),
    };
    const getOwnedIntegrationRecord = new GetOwnedIntegrationRecord({ integrationRepository });
    const instance = {
        send: jest.fn().mockResolvedValue({ ok: true }),
        testAuth: jest.fn().mockResolvedValue(true),
        reconcileAuthStatus: jest.fn(),
        record: { messages: { errors: [] } },
    };
    const getIntegrationInstance = { execute: jest.fn().mockResolvedValue(instance) };
    return { integrationRepository, getOwnedIntegrationRecord, getIntegrationInstance, instance };
}

describe('v2 integration operations', () => {
    it('404s a missing, foreign or malformed integration', async () => {
        const d = deps({ found: { ...record, userId: 'u2' } });
        await expect(d.getOwnedIntegrationRecord.execute('i1', user)).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'INTEGRATION_NOT_FOUND' },
        });
        await expect(d.getOwnedIntegrationRecord.execute('i2', user)).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
        d.integrationRepository.findIntegrationById.mockRejectedValue(
            new Error('Invalid ID: x cannot be converted to integer')
        );
        await expect(d.getOwnedIntegrationRecord.execute('x', user)).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });

    describe('CreateIntegrationForUser', () => {
        const build = () => {
            const createIntegration = { execute: jest.fn().mockResolvedValue({ id: 'new' }) };
            const getEntityModuleForUser = {
                loadOwnedEntity: jest.fn(async (id) => {
                    if (id !== 'e1' && id !== 'e2') {
                        const Boom = require('@hapi/boom');
                        throw Boom.notFound('nope');
                    }
                    return { id };
                }),
            };
            return {
                createIntegration,
                useCase: new CreateIntegrationForUser({
                    createIntegration,
                    getEntityModuleForUser,
                    integrationClasses: [{ Definition: { name: 'sync' } }],
                }),
            };
        };

        it('creates an integration between owned entities', async () => {
            const { useCase, createIntegration } = build();
            await useCase.execute({ entities: ['e1', 'e2'], config: { type: 'sync' } }, user);
            expect(createIntegration.execute).toHaveBeenCalledWith(['e1', 'e2'], 'u1', { type: 'sync' });
        });

        it('refuses entities the caller does not own', async () => {
            const { useCase, createIntegration } = build();
            await expect(
                useCase.execute({ entities: ['e1', 'e9'], config: { type: 'sync' } }, user)
            ).rejects.toMatchObject({ output: { statusCode: 404 } });
            expect(createIntegration.execute).not.toHaveBeenCalled();
        });

        it.each([
            [{ entities: ['e1'], config: {} }, 'VALIDATION_ERROR'],
            [{ entities: ['e1'], config: { type: 'other' } }, 'UNKNOWN_INTEGRATION_TYPE'],
            [{ entities: 'e1', config: { type: 'sync' } }, 'VALIDATION_ERROR'],
        ])('rejects %j with 400 %s', async (body, code) => {
            const { useCase } = build();
            await expect(useCase.execute(body, user)).rejects.toMatchObject({
                output: { statusCode: 400 },
                data: { code },
            });
        });
    });

    it('loads the instance with the record owner id', async () => {
        const d = deps();
        const useCase = new GetIntegrationInstanceForUser(d);
        expect(await useCase.execute('i1', user)).toBe(d.instance);
        expect(d.getIntegrationInstance.execute).toHaveBeenCalledWith('i1', 'u1');
    });

    it('updates and removes through the existing use cases', async () => {
        const d = deps();
        const updateIntegration = { execute: jest.fn().mockResolvedValue({ id: 'i1' }) };
        await new UpdateIntegrationForUser({ ...d, updateIntegration }).execute('i1', user, { a: 1 });
        expect(updateIntegration.execute).toHaveBeenCalledWith('i1', 'u1', { a: 1 });
        await expect(
            new UpdateIntegrationForUser({ ...d, updateIntegration }).execute('i1', user, 'x')
        ).rejects.toMatchObject({ output: { statusCode: 400 } });

        const deleteIntegrationForUser = { execute: jest.fn() };
        await new RemoveIntegrationForUser({ ...d, deleteIntegrationForUser }).execute('i1', user);
        expect(deleteIntegrationForUser.execute).toHaveBeenCalledWith('i1', 'u1');
    });

    it('sends events and tests auth on the instance', async () => {
        const d = deps();
        const getIntegrationInstanceForUser = new GetIntegrationInstanceForUser(d);
        await new SendIntegrationEventForUser({ getIntegrationInstanceForUser }).execute(
            'i1', user, 'GET_CONFIG_OPTIONS'
        );
        expect(d.instance.send).toHaveBeenCalledWith('GET_CONFIG_OPTIONS', undefined);

        const result = await new TestIntegrationAuthForUser({ getIntegrationInstanceForUser }).execute('i1', user);
        expect(result).toEqual({ ok: true, errors: [] });
        expect(d.instance.reconcileAuthStatus).toHaveBeenCalledWith(true);
    });

    it('runs only actions the integration lists as user actions', async () => {
        const d = deps();
        d.instance.loadUserActions = jest.fn().mockResolvedValue({ SYNC_NOW: {} });
        const getIntegrationInstanceForUser = new GetIntegrationInstanceForUser(d);
        const useCase = new RunIntegrationActionForUser({ getIntegrationInstanceForUser });

        await useCase.execute('i1', user, 'SYNC_NOW', { a: 1 });
        expect(d.instance.send).toHaveBeenCalledWith('SYNC_NOW', { a: 1 });

        await expect(useCase.execute('i1', user, 'ON_DELETE', {})).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'ACTION_NOT_FOUND' },
        });
        await expect(useCase.execute('i1', user, 'constructor', {})).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });
});
