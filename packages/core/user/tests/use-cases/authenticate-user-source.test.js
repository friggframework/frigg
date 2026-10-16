const { AuthenticateUser } = require('../../use-cases/authenticate-user');
const { User, AUTH_SOURCES } = require('../../user');

/** AuthenticateUser records HOW a request authenticated, so roles never rest on a missing value. */
describe('AuthenticateUser records the authentication source (ADR-056 §3)', () => {
    const makeUser = () => new User({ id: '7', appUserId: 'u' }, { id: '17', appOrgId: 'o' }, false, 'individual', true, false);
    const build = (userConfig) => {
        const deps = {
            getUserFromBearerToken: { execute: jest.fn(async () => makeUser()) },
            getUserFromXFriggHeaders: { execute: jest.fn(async () => makeUser()) },
            getUserFromAdopterJwt: { execute: jest.fn(async () => makeUser()) },
            authenticateWithSharedSecret: { execute: jest.fn(async () => undefined) },
        };
        return new AuthenticateUser({ ...deps, userConfig });
    };
    const jwt = 'a.b.c';

    it('a user nobody authenticated has no source', () => {
        expect(makeUser().getAuthSource()).toBeNull();
    });

    it('x-frigg headers with the shared secret: shared-secret', async () => {
        const user = await build({ authModes: { sharedSecret: true } }).execute({
            headers: { 'x-frigg-api-key': 'k', 'x-frigg-appuserid': 'u', 'x-frigg-apporgid': 'o' },
        });
        expect(user.getAuthSource()).toBe(AUTH_SOURCES.SHARED_SECRET);
    });

    it('an adopter JWT: adopter-jwt', async () => {
        const user = await build({ authModes: { adopterJwt: true } }).execute({
            headers: { authorization: `Bearer ${jwt}` },
        });
        expect(user.getAuthSource()).toBe(AUTH_SOURCES.ADOPTER_JWT);
    });

    it('a Frigg bearer token: bearer-token', async () => {
        const user = await build({ authModes: { friggToken: true } }).execute({
            headers: { authorization: 'Bearer opaque' },
        });
        expect(user.getAuthSource()).toBe(AUTH_SOURCES.BEARER_TOKEN);
    });

    it('a request that also sends x-frigg headers with a token is still a token request', async () => {
        const user = await build({ authModes: { adopterJwt: true } }).execute({
            headers: { authorization: `Bearer ${jwt}`, 'x-frigg-appuserid': 'u', 'x-frigg-apporgid': 'o' },
        });
        expect(user.getAuthSource()).toBe(AUTH_SOURCES.ADOPTER_JWT);
    });
});
