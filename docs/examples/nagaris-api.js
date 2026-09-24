/**
 * Example Nagaris API Client
 *
 * This is a mock implementation showing the structure needed for multi-step auth.
 * Replace with actual Nagaris API implementation.
 */

class NagarisApi {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || 'https://api.nagaris.com/api/v1';
        this.accessToken = config.access_token;
    }

    /**
     * Step 1: Request OTP login via email
     * @param {string} email - User's email address
     * @returns {Promise<void>}
     */
    async requestEmailLogin(email) {
        // POST /api/v1/auth/login-email
        const response = await this._request('POST', '/auth/login-email', {
            email
        });

        // Nagaris sends OTP via email, API returns success
        if (!response.success) {
            throw new Error('Failed to send OTP');
        }
    }

    /**
     * Step 2: Verify OTP and get auth tokens
     * @param {string} email - User's email address
     * @param {string} otp - One-time password from email
     * @returns {Promise<Object>} Auth response with tokens
     */
    async verifyOtp(email, otp) {
        // POST /api/v1/auth/login-otp
        const response = await this._request('POST', '/auth/login-otp', {
            email,
            otp
        });

        // Response format:
        // {
        //   access: "eyJhbGc...",
        //   refresh: "eyJhbGc...",
        //   user: { id: 123, email: "...", name: "..." }
        // }

        if (!response.access) {
            throw new Error('Invalid OTP or authentication failed');
        }

        return response;
    }

    /**
     * Get current authenticated user
     * @returns {Promise<Object>}
     */
    async getCurrentUser() {
        return this._request('GET', '/users/me');
    }

    /**
     * Internal request method
     * @private
     */
    async _request(method, path, data = null) {
        const url = `${this.baseUrl}${path}`;
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        }

        const options = {
            method,
            headers
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'Request failed' }));
            throw new Error(error.message || `HTTP ${response.status}`);
        }

        return response.json();
    }
}

module.exports = { NagarisApi };
