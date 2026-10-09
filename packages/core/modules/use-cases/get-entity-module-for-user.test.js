const { GetEntityModuleForUser, userOwns } = require('./get-entity-module-for-user');

const user = (id, extra = {}) => ({ getId: () => id, ...extra });
const definition = { moduleName: 'acme' };

function build(entity) {
    const moduleRepository = {
        findEntityById: jest.fn().mockResolvedValue(entity),
    };
    const createModule = jest.fn((params) => ({ built: true, ...params }));
    return {
        useCase: new GetEntityModuleForUser({
            moduleRepository,
            moduleDefinitions: [definition],
            createModule,
        }),
        moduleRepository,
        createModule,
    };
}

describe('GetEntityModuleForUser', () => {
    it('builds the module for an entity the caller owns', async () => {
        const entity = { id: 'e1', userId: 'u1', moduleName: 'acme' };
        const { useCase, createModule } = build(entity);
        const result = await useCase.execute('e1', user('u1'));
        expect(result.entity).toBe(entity);
        expect(result.definition).toBe(definition);
        expect(createModule).toHaveBeenCalledWith({
            userId: 'u1',
            entity,
            definition,
        });
    });

    it('answers 404 for an entity owned by someone else', async () => {
        const { useCase, createModule } = build({ id: 'e1', userId: 'u2', moduleName: 'acme' });
        await expect(useCase.execute('e1', user('u1'))).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'ENTITY_NOT_FOUND' },
        });
        expect(createModule).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing entity', async () => {
        const { useCase } = build(null);
        await expect(useCase.execute('e1', user('u1'))).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });

    it('answers 404 for a malformed id instead of a 500', async () => {
        const { useCase, moduleRepository } = build(null);
        moduleRepository.findEntityById.mockRejectedValue(
            new Error('Invalid ID: abc cannot be converted to integer')
        );
        await expect(useCase.execute('abc', user('u1'))).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });

    it('answers 404 when the app no longer configures the entity type', async () => {
        const { useCase } = build({ id: 'e1', userId: 'u1', moduleName: 'gone' });
        await expect(useCase.execute('e1', user('u1'))).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'ENTITY_TYPE_NOT_FOUND' },
        });
    });

    it('uses the User ownership rule (organisation users)', () => {
        const orgUser = user('org-1', { ownsUserId: (id) => ['org-1', 'ind-1'].includes(id) });
        expect(userOwns(orgUser, 'ind-1')).toBe(true);
        expect(userOwns(orgUser, 'other')).toBe(false);
        expect(userOwns(user('u1'), undefined)).toBe(false);
    });
});
