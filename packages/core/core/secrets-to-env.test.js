const { secretsToEnv } = require('./secrets-to-env');
const { createMemorySink } = require('../logs');
const { SECRETS } = require('../logs/__fixtures__/secrets');

let sink;
let consoleSpies;
const originalFetch = global.fetch;
const originalArn = process.env.SECRET_ARN;

beforeEach(() => {
    sink = createMemorySink();
    consoleSpies = ['log', 'warn', 'error'].map((method) =>
        jest.spyOn(console, method).mockImplementation()
    );
    process.env.SECRET_ARN = 'arn:aws:secretsmanager:eu-west-1:1:secret:app';
});

afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    global.fetch = originalFetch;
    if (originalArn === undefined) delete process.env.SECRET_ARN;
    else process.env.SECRET_ARN = originalArn;
    delete process.env.FRIGG_TEST_SECRET_VALUE;
});

const expectNoConsole = () =>
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());

describe('secretsToEnv logs (ADR-048 Phase 2)', () => {
    it('a failed fetch throws with the status only and logs no body', async () => {
        const body = { SecretString: JSON.stringify({ DB_PASSWORD: SECRETS.dbPassword }) };
        global.fetch = jest.fn(async () => ({
            ok: false,
            status: 403,
            json: async () => body,
        }));

        await expect(secretsToEnv()).rejects.toThrow('Secrets fetch failed with 403');

        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('writes DEBUG records and sets the env on success', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({
                SecretString: JSON.stringify({
                    FRIGG_TEST_SECRET_VALUE: SECRETS.clientSecret,
                }),
            }),
        }));

        await secretsToEnv();

        expect(process.env.FRIGG_TEST_SECRET_VALUE).toBe(SECRETS.clientSecret);
        const events = sink.records.map((r) => [r.level, r.eventName]);
        expect(events).toEqual([
            ['DEBUG', 'frigg.core.secrets.to_env'],
            ['DEBUG', 'frigg.core.secrets.fetching'],
        ]);
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });
});
