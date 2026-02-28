/**
 * Netlify Background Functions Queue Provider (Adapter)
 *
 * Uses Netlify Background Functions for async job processing.
 * Background functions have a 15-minute execution limit and are triggered via HTTP POST.
 * They return 202 immediately while processing continues.
 *
 * Queue ID format: The function name or URL path for the background function.
 * Convention: function files named with '-background' suffix (e.g., 'worker-background.js')
 *
 * Limitations:
 * - No built-in retry (must implement manually)
 * - No dead-letter queue
 * - No FIFO ordering guarantees
 * - 15-minute max execution time
 */
const { QueueProvider } = require('../queue-provider');

class NetlifyBackgroundProvider extends QueueProvider {
    constructor(options = {}) {
        super();
        // Base URL for triggering background functions (e.g., https://mysite.netlify.app)
        this.baseUrl = options.baseUrl || process.env.URL || '';
    }

    /**
     * Send a message by invoking a Netlify Background Function via HTTP POST.
     *
     * @param {Object} message - Message payload
     * @param {string} queueId - Background function path (e.g., '/.netlify/functions/worker-background')
     */
    async send(message, queueId) {
        const url = `${this.baseUrl}${queueId}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message),
        });

        if (!response.ok && response.status !== 202) {
            throw new Error(
                `Failed to invoke background function at ${queueId}: ${response.status} ${response.statusText}`
            );
        }

        return { status: response.status, queueId };
    }

    /**
     * Send batch of messages sequentially (background functions are HTTP-triggered).
     */
    async batchSend(entries = [], queueId) {
        const results = [];
        for (const entry of entries) {
            const result = await this.send(entry, queueId);
            results.push(result);
        }
        return { results };
    }

    /**
     * Parse Netlify Background Function event.
     * Background functions receive the raw HTTP event body as the event.
     */
    parseEvent(event) {
        const body =
            typeof event.body === 'string'
                ? JSON.parse(event.body)
                : event.body;

        // Background functions receive a single message per invocation
        return [body];
    }
}

module.exports = { NetlifyBackgroundProvider };
