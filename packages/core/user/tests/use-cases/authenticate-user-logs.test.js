const { AuthenticateUser } = require('../../use-cases/authenticate-user');
const { createMemorySink } = require('../../../logs');
const { SECRETS } = require('../../../logs/__fixtures__/secrets');

const LOGGER = 'frigg.user.authentication';

describe('AuthenticateUser logs (ADR-048)', () => {
    let sink;
    let consoleSpies;
    let user;
    let deps;

    const buildUseCase = (authModes) =>
        new AuthenticateUser({ ...deps, userConfig: { authModes } });

    const byEvent = (suffix) =>
        sink.records.filter((r) => r.eventName === `${LOGGER}.${suffix}`);

    beforeEach(() => {
        sink = createMemorySink();
        consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );
        user = { getAppUserId: () => 'app-user-1', getAppOrgId: () => null };
        deps = {
            getUserFromBearerToken: {
                execute: jest.fn().mockResolvedValue(user),
            },
            getUserFromXFriggHeaders: {
                execute: jest.fn().mockResolvedValue(user),
            },
            getUserFromAdopterJwt: {
                execute: jest.fn().mockResolvedValue(user),
            },
            authenticateWithSharedSecret: {
                execute: jest.fn().mockResolvedValue(undefined),
            },
        };
    });

    afterEach(() => {
        for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    it('writes the request header names at DEBUG and never a header value', async () => {
        const req = {
            headers: {
                authorization: `Bearer ${SECRETS.bearer}`,
                'x-frigg-api-key': SECRETS.friggApiKey,
                cookie: `session=${SECRETS.cookie}`,
            },
        };

        await buildUseCase({ sharedSecret: true }).execute(req);

        expect(byEvent('headers_received')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                logger: LOGGER,
                headerNames: ['authorization', 'x-frigg-api-key', 'cookie'],
            }),
        ]);
        expect(sink.records).toContainNoSecretWindow([
            SECRETS.bearer,
            SECRETS.friggApiKey,
            SECRETS.cookie,
        ]);
    });

    it('writes shared_secret_attempted, and not shared_secret_skipped, when the API key is present', async () => {
        await buildUseCase({ sharedSecret: true }).execute({
            headers: { 'x-frigg-api-key': SECRETS.friggApiKey },
        });

        expect(byEvent('shared_secret_attempted')).toHaveLength(1);
        expect(byEvent('shared_secret_skipped')).toHaveLength(0);
    });

    it('writes shared_secret_skipped when the API key is absent', async () => {
        await buildUseCase({ sharedSecret: true, friggToken: true }).execute({
            headers: { authorization: `Bearer ${SECRETS.bearer}` },
        });

        expect(byEvent('shared_secret_skipped')).toHaveLength(1);
        expect(byEvent('shared_secret_attempted')).toHaveLength(0);
    });

    it('writes adopter_jwt_attempted for a Bearer token when adopterJwt is on', async () => {
        await buildUseCase({
            sharedSecret: false,
            adopterJwt: true,
            friggToken: false,
        }).execute({ headers: { authorization: `Bearer ${SECRETS.jwt}` } });

        expect(byEvent('adopter_jwt_attempted')).toHaveLength(1);
        expect(sink.records).toContainNoSecretWindow([SECRETS.jwt]);
    });

    it('writes frigg_token_attempted for the native token path', async () => {
        await buildUseCase({ sharedSecret: false, friggToken: true }).execute({
            headers: { authorization: `Bearer ${SECRETS.bearer}` },
        });

        expect(byEvent('frigg_token_attempted')).toHaveLength(1);
        expect(sink.records).toContainNoSecretWindow([SECRETS.bearer]);
    });

    it('writes no WARN or ERROR record when no auth is provided; the boundary logs the 401', async () => {
        await expect(
            buildUseCase({ sharedSecret: true, friggToken: true }).execute({
                headers: {},
            })
        ).rejects.toMatchObject({ isBoom: true });

        expect(
            sink.records.filter((r) => ['WARN', 'ERROR'].includes(r.level))
        ).toHaveLength(0);
    });
});
