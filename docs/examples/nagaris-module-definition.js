/**
 * Example Nagaris Module Definition with Multi-Step Authentication
 *
 * This example demonstrates how to implement a 2-step OTP authentication flow:
 * Step 1: User provides email → API sends OTP
 * Step 2: User provides OTP → API returns auth tokens
 *
 * This pattern can be adapted for any multi-step authentication flow.
 */

const { IntegrationBase } = require('@friggframework/core');
const { NagarisApi } = require('./nagaris-api');

class NagarisDefinition extends IntegrationBase {
    /**
     * Get the module name
     * @returns {string}
     */
    static getName() {
        return 'nagaris';
    }

    /**
     * Get the display name for UI
     * @returns {string}
     */
    static getDisplayName() {
        return 'Nagaris CRM';
    }

    /**
     * NEW: Specify number of authentication steps
     * Default is 1 for backward compatibility
     * @returns {number}
     */
    static getAuthStepCount() {
        return 2; // Email → OTP
    }

    /**
     * NEW: Get authorization requirements for specific step
     * @param {number} step - Step number (1-based)
     * @returns {Promise<Object>} JSON Schema and UI Schema for the step
     */
    static async getAuthRequirementsForStep(step = 1) {
        if (step === 1) {
            // Step 1: Email input
            return {
                type: 'email',
                data: {
                    jsonSchema: {
                        title: 'Nagaris Authentication',
                        description: 'Enter your Nagaris account email to receive a verification code',
                        type: 'object',
                        required: ['email'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address',
                                description: 'Your Nagaris account email'
                            }
                        }
                    },
                    uiSchema: {
                        email: {
                            'ui:placeholder': 'your.email@company.com',
                            'ui:help': 'Enter the email address associated with your Nagaris account',
                            'ui:autofocus': true
                        }
                    }
                }
            };
        }

        if (step === 2) {
            // Step 2: OTP verification
            return {
                type: 'otp',
                data: {
                    jsonSchema: {
                        title: 'Verify One-Time Password',
                        description: 'Enter the 6-digit code sent to your email',
                        type: 'object',
                        required: ['email', 'otp'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address',
                                readOnly: true
                            },
                            otp: {
                                type: 'string',
                                title: 'Verification Code',
                                description: 'Check your email for the code',
                                minLength: 6,
                                maxLength: 6,
                                pattern: '^[0-9]{6}$'
                            }
                        }
                    },
                    uiSchema: {
                        email: {
                            'ui:readonly': true,
                            'ui:disabled': true
                        },
                        otp: {
                            'ui:placeholder': '000000',
                            'ui:help': 'Enter the 6-digit verification code from your email',
                            'ui:autofocus': true,
                            'ui:inputType': 'tel'
                        }
                    }
                }
            };
        }

        throw new Error(`Step ${step} is not defined for Nagaris authentication`);
    }

    /**
     * NEW: Process a specific authentication step
     * @param {NagarisApi} api - API client instance
     * @param {number} step - Current step number
     * @param {Object} stepData - Data submitted for this step
     * @param {Object} sessionData - Accumulated data from previous steps
     * @returns {Promise<Object>} Result object with nextStep or completed flag
     */
    static async processAuthorizationStep(api, step, stepData, sessionData = {}) {
        if (step === 1) {
            // Step 1: Request OTP via email
            const { email } = stepData;

            // Validate email format
            if (!email || !email.includes('@')) {
                throw new Error('Valid email address is required');
            }

            try {
                // Call Nagaris API to send OTP
                await api.requestEmailLogin(email);

                // Return data for next step
                return {
                    nextStep: 2,
                    stepData: { email }, // Store email for step 2
                    message: `Verification code sent to ${email}. Please check your email.`
                };
            } catch (error) {
                throw new Error(`Failed to send OTP: ${error.message}`);
            }
        }

        if (step === 2) {
            // Step 2: Verify OTP and complete authentication
            const { email, otp } = stepData;

            // Validate OTP format
            if (!otp || !/^\d{6}$/.test(otp)) {
                throw new Error('Verification code must be exactly 6 digits');
            }

            try {
                // Verify OTP with Nagaris API
                const authResponse = await api.verifyOtp(email, otp);

                // Validate response structure
                if (!authResponse.access || !authResponse.user) {
                    throw new Error('Invalid authentication response from Nagaris');
                }

                // Return completed auth data for ProcessAuthorizationCallback
                return {
                    completed: true,
                    authData: {
                        access_token: authResponse.access,
                        refresh_token: authResponse.refresh,
                        user: authResponse.user,
                        token_type: 'Bearer',
                        expires_in: 3600 // 1 hour
                    }
                };
            } catch (error) {
                // Provide user-friendly error messages
                if (error.message.includes('invalid') || error.message.includes('expired')) {
                    throw new Error('Invalid or expired verification code. Please try again.');
                }
                throw new Error(`Authentication failed: ${error.message}`);
            }
        }

        throw new Error(`Step ${step} is not implemented for Nagaris authentication`);
    }

    /**
     * Test the authentication credentials
     * Called after multi-step auth completes
     * @param {Object} authData - Completed authentication data
     * @returns {Promise<boolean>}
     */
    static async testAuth(authData) {
        const api = new NagarisApi({
            access_token: authData.access_token
        });

        try {
            // Test by fetching current user
            const user = await api.getCurrentUser();
            return !!user.id;
        } catch (error) {
            console.error('Nagaris auth test failed:', error);
            return false;
        }
    }

    /**
     * Get entity details after authentication
     * @param {Object} authData - Authentication data
     * @returns {Promise<Object>}
     */
    static async getEntityDetails(authData) {
        const api = new NagarisApi({
            access_token: authData.access_token
        });

        const user = await api.getCurrentUser();

        return {
            name: user.email,
            externalId: user.id.toString(),
            details: {
                email: user.email,
                name: user.name,
                company: user.company
            }
        };
    }

    // ===========================================================================
    // SINGLE-STEP AUTH (BACKWARD COMPATIBILITY)
    // If getAuthStepCount() is not defined or returns 1, these methods are used
    // ===========================================================================

    /**
     * Legacy single-step authorization requirements
     * Used for backward compatibility if multi-step methods not defined
     * @returns {Promise<Object>}
     */
    static async getAuthorizationRequirements() {
        // Fallback to step 1 requirements
        return this.getAuthRequirementsForStep(1);
    }
}

module.exports = NagarisDefinition;
