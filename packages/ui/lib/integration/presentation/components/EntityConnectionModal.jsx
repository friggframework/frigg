/**
 * @file Entity Connection Modal
 * @description Modal for connecting a new entity (OAuth or form-based)
 * Supports both JSON schema forms and OAuth flows
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Form } from '../../Form';
import { LoadingSpinner } from '../../../components/LoadingSpinner';
import { Button } from '../../../components/button.jsx';
import API from '../../../api/api.js';
import { X } from 'lucide-react';

export const EntityConnectionModal = ({
    isOpen,
    entityType,
    friggBaseUrl,
    authToken,
    onSuccess,
    onCancel,
    context = {}
}) => {
    const [loading, setLoading] = useState(true);
    const [authType, setAuthType] = useState(null);
    const [jsonSchema, setJsonSchema] = useState(null);
    const [uiSchema, setUiSchema] = useState(null);
    const [formData, setFormData] = useState({});
    const [error, setError] = useState(null);

    const api = useMemo(() => new API(friggBaseUrl, authToken), [friggBaseUrl, authToken]);

    useEffect(() => {
        if (isOpen && entityType) {
            loadAuthRequirements();
        }
    }, [isOpen, entityType]);

    const loadAuthRequirements = async () => {
        setLoading(true);
        setError(null);

        try {
            // Get authorization requirements from API
            const authorizeData = await api.getAuthorizeRequirements(entityType, '');

            if (authorizeData.type === 'oauth2') {
                setAuthType('oauth2');
                setJsonSchema(null);
                setUiSchema(null);
            } else {
                // Form-based auth - extract JSON schema
                setAuthType('form');
                const data = authorizeData.data;

                // Ensure ui:widget is set for all fields
                if (data.uiSchema) {
                    for (const element of Object.entries(data.uiSchema)) {
                        if (!element[1]['ui:widget']) {
                            element[1]['ui:widget'] = 'text';
                        }
                    }
                }

                setJsonSchema(data.jsonSchema);
                setUiSchema(data.uiSchema);
                setFormData({});
            }
        } catch (err) {
            console.error('Error loading auth requirements:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleOAuthConnect = async () => {
        try {
            const authorizeData = await api.getAuthorizeRequirements(entityType, '');
            if (authorizeData.type === 'oauth2' && authorizeData.url) {
                // Redirect to OAuth URL
                window.location.href = authorizeData.url;
            }
        } catch (err) {
            console.error('Error starting OAuth flow:', err);
            setError(err.message);
        }
    };

    const handleFormChange = (data) => {
        setFormData(data.data);
    };

    const handleFormSubmit = async () => {
        setLoading(true);
        setError(null);

        try {
            // Authorize with form data
            const result = await api.authorize(entityType, formData);

            if (!result) {
                throw new Error(`Failed to authorize ${entityType}`);
            }

            if (result.error) {
                throw new Error(result.error);
            }

            // Entity created successfully
            if (onSuccess) {
                onSuccess(result);
            }
        } catch (err) {
            console.error('Error connecting entity:', err);
            setError(err.message || 'Authorization failed. Please check your credentials.');
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">
                    Connect {entityType}
                </h2>
                <p className="text-sm text-muted-foreground">
                    Create a new connection to continue installing the integration
                </p>
            </div>

            {/* Content */}
            <div className="space-y-4">
                {loading && !jsonSchema ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                        <span className="text-sm text-muted-foreground">Loading connection options...</span>
                    </div>
                ) : error ? (
                    <div className="rounded-md bg-destructive/10 border border-destructive/20 p-6">
                        <h3 className="text-lg font-semibold text-destructive mb-2">Connection Error</h3>
                        <p className="text-sm text-destructive/90">{error}</p>
                    </div>
                ) : authType === 'oauth2' ? (
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                            Click the button below to authorize access to your {entityType} account
                            through a secure OAuth connection.
                        </p>
                        <button
                            onClick={handleOAuthConnect}
                            disabled={loading}
                            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Connect with {entityType}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Form
                            schema={jsonSchema}
                            uiSchema={uiSchema}
                            data={formData}
                            onChange={handleFormChange}
                        />
                    </div>
                )}
            </div>

            {/* Footer - Always show action buttons */}
            <div className="flex gap-3 justify-end pt-4 border-t border-border">
                <button
                    onClick={onCancel}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors font-medium text-sm"
                >
                    Cancel
                </button>
                {authType === 'form' && !loading && !error && (
                    <button
                        onClick={handleFormSubmit}
                        disabled={loading}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />}
                        {loading ? 'Connecting...' : 'Connect'}
                    </button>
                )}
            </div>
        </div>
    );
};
