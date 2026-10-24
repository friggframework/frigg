const {
    createQueueProvider,
    determineProvider,
    QUEUE_PROVIDERS,
} = require('./queue-provider-factory');
const { QueueProvider } = require('./queue-provider');
const { NetlifyBackgroundProvider } = require('./providers/netlify-background-provider');
const { QStashQueueProvider } = require('./providers/qstash-queue-provider');
const { SqsQueueProvider } = require('./providers/sqs-queue-provider');

describe('queue provider factory (friggframework/frigg#545)', () => {
    const saved = process.env.QUEUE_PROVIDER;
    afterEach(() => {
        if (saved === undefined) delete process.env.QUEUE_PROVIDER;
        else process.env.QUEUE_PROVIDER = saved;
    });

    it('defaults to SQS without any configuration (AWS apps need no provider package)', () => {
        delete process.env.QUEUE_PROVIDER;
        expect(createQueueProvider()).toBeInstanceOf(SqsQueueProvider);
    });

    it.each([
        ['sqs', SqsQueueProvider],
        ['aws', SqsQueueProvider],
        ['netlify-background', NetlifyBackgroundProvider],
        ['netlify', NetlifyBackgroundProvider],
        ['qstash', QStashQueueProvider],
    ])('maps %s to the built-in adapter', (name, Klass) => {
        const provider = createQueueProvider({ provider: name });
        expect(provider).toBeInstanceOf(Klass);
        expect(provider).toBeInstanceOf(QueueProvider);
    });

    it('reads explicit option, then appDefinition.queue.provider, then QUEUE_PROVIDER', () => {
        process.env.QUEUE_PROVIDER = 'qstash';
        expect(determineProvider({})).toBe('qstash');
        expect(determineProvider({ appDefinition: { queue: { provider: 'sqs' } } })).toBe('sqs');
        expect(
            determineProvider({ provider: 'netlify-background', appDefinition: { queue: { provider: 'sqs' } } })
        ).toBe('netlify-background');
        expect(createQueueProvider({})).toBeInstanceOf(QStashQueueProvider);
    });

    it('resolves an unknown name through the provider plugin system', () => {
        expect(() => createQueueProvider({ provider: 'vercel' })).toThrow(
            /Is 'vercel' a valid Frigg provider/
        );
    });

    it('exposes the built-in names', () => {
        expect(QUEUE_PROVIDERS).toEqual({
            SQS: 'sqs',
            NETLIFY_BACKGROUND: 'netlify-background',
            QSTASH: 'qstash',
        });
    });
});

describe('NetlifyBackgroundProvider', () => {
    const realFetch = global.fetch;
    afterEach(() => {
        global.fetch = realFetch;
    });

    it('POSTs the message to the background function under the site URL', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 202 });
        const provider = new NetlifyBackgroundProvider({ baseUrl: 'https://site.example', signingSecret: 's' });

        const result = await provider.send({ event: 'X' }, '/.netlify/functions/worker-background');

        expect(global.fetch).toHaveBeenCalledWith(
            'https://site.example/.netlify/functions/worker-background',
            expect.objectContaining({ method: 'POST', body: JSON.stringify({ event: 'X' }) })
        );
        expect(result).toEqual({ status: 202, queueId: '/.netlify/functions/worker-background' });
    });

    it('throws on a non-2xx, non-202 response', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'boom' });
        const provider = new NetlifyBackgroundProvider({ baseUrl: 'https://site.example', signingSecret: 's' });
        await expect(provider.send({}, '/.netlify/functions/worker-background')).rejects.toThrow(/500 boom/);
    });

    it('parses a string or object body into one message', () => {
        const provider = new NetlifyBackgroundProvider();
        expect(provider.parseEvent({ body: '{"a":1}' })).toEqual([{ a: 1 }]);
        expect(provider.parseEvent({ body: { a: 2 } })).toEqual([{ a: 2 }]);
    });
});

describe('QStashQueueProvider', () => {
    it('refuses to send without a token', async () => {
        const saved = process.env.QSTASH_TOKEN;
        delete process.env.QSTASH_TOKEN;
        try {
            await expect(new QStashQueueProvider().send({}, 'https://x')).rejects.toThrow(
                /QSTASH_TOKEN is required/
            );
        } finally {
            if (saved !== undefined) process.env.QSTASH_TOKEN = saved;
        }
    });
});

describe('SqsQueueProvider', () => {
    it('sends through the injected queue client and batches by ten', async () => {
        const queueClient = {
            sendMessage: jest.fn().mockResolvedValue({ MessageId: 'm1' }),
            sendMessageBatch: jest.fn().mockResolvedValue({ Successful: [] }),
        };
        const provider = new SqsQueueProvider({ queueClient });

        await provider.send({ a: 1 }, 'https://sqs/q');
        expect(queueClient.sendMessage).toHaveBeenCalledWith({
            MessageBody: '{"a":1}',
            QueueUrl: 'https://sqs/q',
        });

        await provider.batchSend(Array.from({ length: 23 }, (_, i) => ({ i })), 'https://sqs/q');
        const sizes = queueClient.sendMessageBatch.mock.calls.map(([p]) => p.Entries.length);
        expect(sizes).toEqual([10, 10, 3]);
    });

    it('parses SQS records', () => {
        const provider = new SqsQueueProvider({ queueClient: {} });
        expect(provider.parseEvent({ Records: [{ body: '{"x":1}' }] })).toEqual([{ x: 1 }]);
        expect(provider.parseEvent({})).toEqual([]);
    });
});
