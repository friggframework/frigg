jest.mock('../../../database/prisma', () => ({ prisma: {} }));

const { ClientSafeError } = require('../../../errors');
const {
    TokenRepositoryMongo,
    TokenRepositoryPostgres,
    TokenRepositoryDocumentDB,
} = require('../token-repository-factory');

describe.each([
    ['TokenRepositoryMongo', TokenRepositoryMongo],
    ['TokenRepositoryPostgres', TokenRepositoryPostgres],
    ['TokenRepositoryDocumentDB', TokenRepositoryDocumentDB],
])('%s.getJSONTokenFromBase64BufferToken', (_name, Repository) => {
    const repository = new Repository();

    it('decodes a token it created', () => {
        const encoded = repository.createBase64BufferToken({ id: 'token-1' }, 'raw');

        expect(repository.getJSONTokenFromBase64BufferToken(encoded)).toEqual({
            id: 'token-1',
            token: 'raw',
        });
    });

    const base64 = (value) => Buffer.from(value).toString('base64');

    it.each([
        ['not JSON', 'not-a-frigg-token'],
        ['null', base64('null')],
        ['a number', base64('42')],
        ['an empty object', base64('{}')],
        ['an object without a token', base64('{"id":"token-1"}')],
    ])('rejects a token that decodes to %s as a client-safe 401', (_case, encoded) => {
        let thrown;
        try {
            repository.getJSONTokenFromBase64BufferToken(encoded);
        } catch (error) {
            thrown = error;
        }

        expect(thrown).toBeInstanceOf(ClientSafeError);
        expect(thrown).toMatchObject({
            statusCode: 401,
            message: 'Invalid Token: Token is malformed',
        });
    });
});
