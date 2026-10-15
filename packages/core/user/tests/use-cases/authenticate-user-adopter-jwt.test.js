/* eslint-disable camelcase -- JWT claim names (org_id, org_role) and reason codes are snake_case by spec */
const { AuthenticateUser } = require('../../use-cases/authenticate-user');
const {
    GetUserFromAdopterJwt,
} = require('../../use-cases/get-user-from-adopter-jwt');
const {
    createKeys,
    signToken,
    createUserRepositoryDouble,
} = require('../doubles/adopter-jwt-fixtures');

/** AuthenticateUser wired to the real adopter-JWT use case, real signatures. */
describe('AuthenticateUser with adopter JWT', () => {
    let keys;
    let repo;
    let getUserFromBearerToken;
    let getUserFromXFriggHeaders;

    const userConfig = {
        primary: 'organization',
        individualUserRequired: true,
        organizationUserRequired: true,
        authModes: { adopterJwt: true, friggToken: true },
        jwtConfig: { jwksUri: 'https://login.example.com/jwks.json' },
    };

    const authenticate = (headers) =>
        new AuthenticateUser({
            getUserFromBearerToken,
            getUserFromXFriggHeaders,
            getUserFromAdopterJwt: new GetUserFromAdopterJwt({
                userRepository: repo,
                userConfig,
                keySource: keys.localJwks,
            }),
            authenticateWithSharedSecret: { execute: jest.fn() },
            userConfig,
        }).execute({ headers });

    const bearer = async (claims) =>
        `Bearer ${await signToken(claims, {
            key: keys.es.privateKey,
            kid: 'es-1',
        })}`;

    beforeAll(async () => {
        keys = await createKeys();
    });

    beforeEach(() => {
        repo = createUserRepositoryDouble();
        getUserFromBearerToken = { execute: jest.fn() };
        getUserFromXFriggHeaders = { execute: jest.fn() };
    });

    it('authenticates a JWT and never reaches the native-token or x-frigg paths', async () => {
        const user = await authenticate({
            authorization: await bearer({ sub: 'u1', org_id: 'o1' }),
        });

        expect(user.getAppUserId()).toBe('u1');
        expect(user.getAppOrgId()).toBe('o1');
        expect(getUserFromBearerToken.execute).not.toHaveBeenCalled();
        expect(getUserFromXFriggHeaders.execute).not.toHaveBeenCalled();
    });

    it('passes when x-frigg-appuserid and x-frigg-apporgid match the token', async () => {
        const user = await authenticate({
            authorization: await bearer({ sub: 'u1', org_id: 'o1' }),
            'x-frigg-appuserid': 'u1',
            'x-frigg-apporgid': 'o1',
        });

        expect(user.getAppUserId()).toBe('u1');
    });

    it('answers 403 when x-frigg-appuserid names someone else', async () => {
        const error = await authenticate({
            authorization: await bearer({ sub: 'u1', org_id: 'o1' }),
            'x-frigg-appuserid': 'someone-else',
        }).catch((e) => e);

        expect(error.output.statusCode).toBe(403);
        expect(error.message).toContain('x-frigg-appuserid');
    });

    it('answers 403 when x-frigg-apporgid names another organization', async () => {
        const error = await authenticate({
            authorization: await bearer({ sub: 'u1', org_id: 'o1' }),
            'x-frigg-apporgid': 'other-org',
        }).catch((e) => e);

        expect(error.output.statusCode).toBe(403);
        expect(error.message).toContain('x-frigg-apporgid');
    });

    it('lets a forged x-frigg header not widen access: the token decides who the user is', async () => {
        const error = await authenticate({
            authorization: await bearer({ sub: 'u1' }),
            'x-frigg-apporgid': 'victim-org',
        }).catch((e) => e);

        expect(error.output.statusCode).toBe(403);
        expect(repo.createOrganizationUser).not.toHaveBeenCalled();
    });

    it('surfaces an invalid token as 401 and does not fall through to the native-token path', async () => {
        const forged = await signToken(
            { sub: 'u1' },
            { key: keys.attacker.privateKey, kid: 'es-1' }
        );

        const error = await authenticate({
            authorization: `Bearer ${forged}`,
        }).catch((e) => e);

        expect(error.output.statusCode).toBe(401);
        expect(error.data.reason).toBe('token_invalid_signature');
        expect(getUserFromBearerToken.execute).not.toHaveBeenCalled();
    });
});
