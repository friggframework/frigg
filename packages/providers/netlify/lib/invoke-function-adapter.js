/**
 * Netlify Function Invoker
 *
 * Calls another Netlify Function via HTTP POST.
 * On Netlify, functions communicate via HTTP — there's no native cross-invocation
 * API like AWS Lambda.invoke().
 *
 * Uses process.env.URL (set automatically by Netlify) as the base URL.
 */

const invokeFunctionAdapter = {
    /**
     * Invoke a Netlify Function by name.
     *
     * @param {string} functionName - Function name (e.g., 'worker-background')
     * @param {Object} payload - JSON payload to send
     * @param {Object} [options]
     * @param {string} [options.baseUrl] - Override base URL (default: process.env.URL)
     * @returns {Promise<Object>} Parsed JSON response
     */
    async invoke(functionName, payload, options = {}) {
        const baseUrl = options.baseUrl || process.env.URL || '';
        const url = `${baseUrl}/.netlify/functions/${functionName}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        // Background functions return 202 (accepted, processing in background)
        if (response.status === 202) {
            return { accepted: true, status: 202 };
        }

        if (!response.ok) {
            throw new Error(
                `Function invocation failed: ${functionName} returned ${response.status} ${response.statusText}`
            );
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            return response.json();
        }

        return { body: await response.text(), status: response.status };
    },
};

module.exports = { invokeFunctionAdapter };
