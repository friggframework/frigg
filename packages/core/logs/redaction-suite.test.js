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

    describe('Error vectors through telemetry.span (span events)', () => {
        const { InMemorySpanExporter } = require('@opentelemetry/sdk-trace-base');
        const { createTelemetry } = require('../telemetry/telemetry-service');

        const errorOf = (vector) => {
            if (vector.message) {
                const message = vector.message();
                if (message instanceof Error) return message;
            }
            const error = vector.fields?.().error;
            return error instanceof Error ? error : null;
        };
        const errorVectors = vectors()
            .map((v) => [v.name, v])
            .filter(([, v]) => errorOf(v));

        it('covers at least the FetchError, cause-chain, aggregate and Prisma vectors', () => {
            expect(errorVectors.length).toBeGreaterThanOrEqual(5);
        });

        async function spanTextFor(error) {
            const traceExporter = new InMemorySpanExporter();
            const telemetry = createTelemetry({ exporter: { type: 'otlp', traceExporter } });
            await telemetry.span('vector', async () => { throw error; }).catch(() => {});
            await telemetry.forceFlush();
            const span = traceExporter.getFinishedSpans().find((s) => s.name === 'vector');
            expect(span.events.some((e) => e.name === 'exception')).toBe(true);
            return JSON.stringify({ events: span.events, status: span.status, attributes: span.attributes });
        }

        it.each(errorVectors)('%s', async (_name, vector) => {
            expect(await spanTextFor(errorOf(vector))).toContainNoSecretWindow(vector.secrets);
        });

        it('a real Requester FetchError', async () => {
            const error = await requesterFetchError();
            expect(await spanTextFor(error)).toContainNoSecretWindow([
                SECRETS.apiKeyQuery,
                SECRETS.bearer,
                SECRETS.accessToken,
            ]);
        });
    });
});
