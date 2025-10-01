/**
 * @file Redirect Handler Component
 * @description Handles OAuth redirect callback
 * This replaces the old RedirectFromAuth component with cleaner architecture
 */

import React, { useEffect, useState } from 'react';

export const RedirectHandler = ({
    connectEntityUseCase,
    onSuccess,
    onError
}) => {
    const [processing, setProcessing] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        handleOAuthCallback();
    }, []);

    const handleOAuthCallback = async () => {
        setProcessing(true);
        setError(null);

        try {
            // Parse URL parameters
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');
            const state = params.get('state');
            const errorParam = params.get('error');

            if (errorParam) {
                throw new Error(`OAuth error: ${errorParam}`);
            }

            if (!code || !state) {
                throw new Error('Missing OAuth parameters');
            }

            // Complete OAuth flow
            const { entity, context } = await connectEntityUseCase.completeOAuthFlow(code, state);

            // Success!
            if (onSuccess) {
                onSuccess(entity, context);
            }
        } catch (err) {
            console.error('Error handling OAuth callback:', err);
            setError(err.message);

            if (onError) {
                onError(err);
            }
        } finally {
            setProcessing(false);
        }
    };

    if (processing) {
        return (
            <div className="redirect-handler processing">
                <div className="spinner" />
                <h3>Completing Connection</h3>
                <p>Please wait while we finalize your connection...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="redirect-handler error">
                <div className="error-icon">⚠️</div>
                <h3>Connection Failed</h3>
                <p>{error}</p>
                <button onClick={() => window.history.back()}>Go Back</button>
            </div>
        );
    }

    return (
        <div className="redirect-handler success">
            <div className="success-icon">✓</div>
            <h3>Connection Successful</h3>
            <p>Your account has been connected successfully.</p>
        </div>
    );
};
