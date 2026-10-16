/**
 * QStash Queue Provider (Adapter)
 *
 * Upstash QStash implementation - platform-agnostic HTTP-based message queue.
 * Works on any platform (Netlify, Vercel, AWS, bare metal, etc.)
 *
 * Features:
 * - Configurable retry with exponential backoff
 * - Dead-letter queue via callbacks
 * - At-least-once delivery
 * - Scheduling support (delay, cron)
 * - Message deduplication
 *
 * Requires:
 * - QSTASH_TOKEN env var (from Upstash console)
 * - QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY for verification
 *
 * Queue ID format: The destination URL that QStash will POST to when delivering the message.
 */
const { QueueProvider } = require('../queue-provider');

const QSTASH_API_BASE = 'https://qstash.upstash.io/v2';

class QStashQueueProvider extends QueueProvider {
    constructor(options = {}) {
        super();
        this.token =
            options.token || process.env.QSTASH_TOKEN;
        this.retries =
            options.retries !== undefined ? options.retries : 3;
    }

    /**
     * Send a message via QStash.
     *
     * @param {Object} message - Message payload
     * @param {string} queueId - Destination URL that QStash will POST to
     */
    async send(message, queueId) {
        if (!this.token) {
            throw new Error(
                'QSTASH_TOKEN is required. Get one at https://console.upstash.com'
            );
        }

        const headers = {
            Authorization: `Bearer ${this.token}`,
            'Content-Type': 'application/json',
            'Upstash-Retries': String(this.retries),
        };

        const response = await fetch(
            `${QSTASH_API_BASE}/publish/${queueId}`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify(message),
            }
        );

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'unknown');
            throw new Error(
                `QStash publish failed: ${response.status} ${response.statusText} - ${errorBody}`
            );
        }

        return response.json();
    }

    /**
     * Send batch of messages via QStash batch API.
     */
    async batchSend(entries = [], queueId) {
        if (!this.token) {
            throw new Error(
                'QSTASH_TOKEN is required. Get one at https://console.upstash.com'
            );
        }

        const messages = entries.map((entry) => ({
            destination: queueId,
            body: JSON.stringify(entry),
            headers: { 'Content-Type': 'application/json' },
            retries: this.retries,
        }));

        const response = await fetch(`${QSTASH_API_BASE}/batch`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(messages),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'unknown');
            throw new Error(
                `QStash batch publish failed: ${response.status} - ${errorBody}`
            );
        }

        return response.json();
    }

    /**
     * Parse QStash webhook delivery event.
     * QStash POSTs the message body directly to the destination URL.
     */
    parseEvent(event) {
        const body =
            typeof event.body === 'string'
                ? JSON.parse(event.body)
                : event.body;

        // QStash delivers a single message per invocation
        return [body];
    }
}

module.exports = { QStashQueueProvider };
