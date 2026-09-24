const { getLogger } = require('./logger');
const { createMemorySink, createStdoutSink } = require('./sinks');
const { resetLoggerForTests } = require('./logger-runtime');
const { redactValue } = require('./redact');
const { vectors, requesterFetchError } = require('./__fixtures__/vectors');
const { SECRETS } = require('./__fixtures__/secrets');

function captureSinks() {
    const memory = createMemorySink({ install: false });
    const chunks = [];
    const stdout = createStdoutSink({
        writeSync: (fd, buffer, offset, length) => {
            chunks.push(Buffer.from(buffer.subarray(offset, offset + length)));
            return length;
        },
        writeStderr: () => {},
        sleep: () => {},
    });
    resetLoggerForTests({ level: 'TRACE', sinks: [memory, stdout] });
    return { memory, stdoutText: () => Buffer.concat(chunks).toString('utf8') };
}

function logVector(vector) {
    let log = getLogger('integration.redaction');
    if (vector.bindings) log = log.child(vector.bindings());
    const message = vector.message ? vector.message() : `vector: ${vector.name}`;
    log[vector.level](message, vector.fields ? vector.fields() : undefined);
}

describe('logs redaction suite (ADR-048 §14)', () => {
    it.each(vectors().map((v) => [v.name, v]))('%s', (_name, vector) => {
        const { memory, stdoutText } = captureSinks();
        logVector(vector);

        expect(memory.records).toHaveLength(1);
        const [record] = memory.records;
        expect(record).toContainNoSecretWindow(vector.secrets);
        expect(stdoutText()).toContainNoSecretWindow(vector.secrets);
        expect(stdoutText()).toBe(`${JSON.stringify(record)}\n`);
        if (vector.expectSanitized) vector.expectSanitized(record);
    });

    it.each(vectors().filter((v) => v.fields).map((v) => [v.name, v]))(
        'redactValue on the bare fields: %s',
        (_name, vector) => {
            expect(redactValue(vector.fields())).toContainNoSecretWindow(vector.secrets);
        }
    );

    it('a real Requester FetchError with ?api_key= and Authorization', async () => {
        const error = await requesterFetchError();
        const { memory, stdoutText } = captureSinks();
        getLogger('integration.redaction').error('Request failed', { error });
        getLogger('integration.redaction').error(error);

        const secrets = [SECRETS.apiKeyQuery, SECRETS.bearer, SECRETS.accessToken];
        expect(memory.records).toHaveLength(2);
        expect(memory.records).toContainNoSecretWindow(secrets);
        expect(stdoutText()).toContainNoSecretWindow(secrets);
        expect(memory.records[0].error).toMatchObject({ type: 'FetchError', status: 401 });
        expect(memory.records[0].error.message).toContain('?api_key=REDACTED');
        expect(memory.records[1].message).toContain('?api_key=REDACTED');
    });
});
