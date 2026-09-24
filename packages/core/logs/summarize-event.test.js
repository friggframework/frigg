const {
    summarizeLambdaEvent,
    summarizeMessageBody,
    toScopeInvocation,
} = require('./summarize-event');
const { httpApiV2Event, restV1Event, sqsEvent } = require('./__fixtures__/events');
const { SECRETS } = require('./__fixtures__/secrets');
const { toContainNoSecretWindow } = require('./__fixtures__/matchers');

expect.extend({ toContainNoSecretWindow });

describe('logs/summarize-event', () => {
    it('summarizes an HTTP API v2 event without values', () => {
        const summary = summarizeLambdaEvent(httpApiV2Event());
        expect(summary).toEqual({
            source: 'http',
            method: 'GET',
            path: '/api/authorize',
            route: '/api/authorize',
            routeKey: 'GET /api/authorize',
            queryKeys: ['code', 'state', 'api_key'],
            headerNames: ['x-frigg-api-key', 'authorization', 'cookie', 'content-type'],
        });
        expect(summary).toContainNoSecretWindow(SECRETS);
    });

    it('summarizes a REST v1 event without values', () => {
        const summary = summarizeLambdaEvent(restV1Event());
        expect(summary).toEqual({
            source: 'http',
            method: 'POST',
            path: '/api/integrations',
            route: '/api/integrations',
            queryKeys: ['access_token'],
            headerNames: ['authorization', 'x-frigg-api-key', 'cookie', 'set-cookie'],
        });
        expect(summary).toContainNoSecretWindow(SECRETS);
    });

    it('summarizes an SQS event per record and never returns a body', () => {
        const summary = summarizeLambdaEvent(sqsEvent());
        expect(summary).toEqual({
            source: 'sqs',
            records: [
                {
                    messageId: 'msg-1',
                    receiveCount: '1',
                    event: 'PROCESS_BATCH',
                    processId: 'proc-1',
                    integrationId: 'int-1',
                },
                { messageId: 'msg-2', receiveCount: '3' },
            ],
        });
        expect(summary).toContainNoSecretWindow(SECRETS);
    });

    it.each([
        [undefined, {}],
        [null, {}],
        [{ foo: 1 }, { source: 'other' }],
        ['a string', {}],
    ])('summarizeLambdaEvent(%p) → %p', (event, expected) => {
        expect(summarizeLambdaEvent(event)).toEqual(expected);
    });

    it('never throws on hostile events', () => {
        const hostile = new Proxy({}, { get: () => { throw new Error('get'); } });
        expect(summarizeLambdaEvent(hostile)).toEqual({ source: 'other' });
        expect(summarizeLambdaEvent({ Records: [null, { body: 5 }] }).records).toHaveLength(2);
    });

    it('summarizeMessageBody picks event, processId and integrationId', () => {
        expect(
            summarizeMessageBody(
                JSON.stringify({ event: 'E', data: { processId: 'p', integrationId: 'i', token: 'x' } })
            )
        ).toEqual({ event: 'E', processId: 'p', integrationId: 'i' });
        expect(summarizeMessageBody('not json')).toEqual({});
        expect(summarizeMessageBody(undefined)).toEqual({});
    });

    describe('toScopeInvocation', () => {
        it('replaces SQS records with recordCount', () => {
            expect(toScopeInvocation(summarizeLambdaEvent(sqsEvent()))).toEqual({
                source: 'sqs',
                recordCount: 2,
            });
        });

        it('keeps the bounded HTTP fields and drops path', () => {
            expect(toScopeInvocation(summarizeLambdaEvent(httpApiV2Event()))).toEqual({
                source: 'http',
                method: 'GET',
                route: '/api/authorize',
                routeKey: 'GET /api/authorize',
                queryKeys: ['code', 'state', 'api_key'],
                headerNames: ['x-frigg-api-key', 'authorization', 'cookie', 'content-type'],
            });
        });

        it('maps other and empty summaries to source only', () => {
            expect(toScopeInvocation({ source: 'other' })).toEqual({ source: 'other' });
            expect(toScopeInvocation({})).toEqual({ source: 'other' });
            expect(toScopeInvocation(undefined)).toEqual({ source: 'other' });
        });
    });
});
