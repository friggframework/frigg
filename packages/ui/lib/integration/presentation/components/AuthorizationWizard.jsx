/**
 * @file Authorization Wizard
 * @description Unified multi-step authorization component
 *
 * Treats ALL authentication flows as multi-step where:
 * - Single-step auth = 1 step (totalSteps: 1)
 * - Multi-step auth = 2+ steps (totalSteps: 2, 3, 4...)
 *
 * This eliminates conditional logic and provides a consistent UX.
 */

import React, { useState, useEffect } from 'react';
import { Form } from '../../Form';

export const AuthorizationWizard = ({
    api,
    entityType,
    onSuccess,
    onCancel,
    onError
}) => {
    // State management
    const [currentStep, setCurrentStep] = useState(1);
    const [totalSteps, setTotalSteps] = useState(1);
    const [sessionId, setSessionId] = useState(null);
    const [requirements, setRequirements] = useState(null);
    const [formData, setFormData] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Initialize: Load requirements for step 1
    useEffect(() => {
        initializeAuth();
    }, [entityType]);

    /**
     * Load initial authorization requirements
     */
    const initializeAuth = async () => {
        try {
            setLoading(true);
            setError(null);

            // Get requirements for step 1
            const reqs = await api.getAuthorizeRequirements(entityType, '', 1, null);

            setCurrentStep(reqs.step || 1);
            setTotalSteps(reqs.totalSteps || 1);
            setSessionId(reqs.sessionId || null);
            setRequirements(reqs);
            setFormData({});
        } catch (err) {
            console.error('Failed to initialize authorization:', err);
            const errorMessage = err.message || 'Failed to load authentication requirements';
            setError(errorMessage);
            if (onError) onError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Handle form data changes
     */
    const handleFormChange = ({ data }) => {
        setFormData(data);
    };

    /**
     * Submit current step
     */
    const handleSubmit = async () => {
        try {
            setSubmitting(true);
            setError(null);

            // Submit current step with accumulated data
            const result = await api.authorize(
                entityType,
                formData,
                currentStep,
                sessionId
            );

            // Check if there's a next step
            if (result.step && result.step > currentStep) {
                // Multi-step: Move to next step
                setCurrentStep(result.step);
                setTotalSteps(result.totalSteps || totalSteps);
                setSessionId(result.sessionId);
                setRequirements(result.requirements);

                // Pre-populate form with data from previous step
                const nextFormData = {};
                if (result.requirements?.data?.jsonSchema?.properties) {
                    Object.keys(result.requirements.data.jsonSchema.properties).forEach(key => {
                        if (formData[key]) {
                            nextFormData[key] = formData[key];
                        }
                    });
                }
                setFormData(nextFormData);
                setSubmitting(false);
            } else {
                // Final step complete - entity created
                if (onSuccess) {
                    onSuccess(result);
                }
            }
        } catch (err) {
            console.error('Authorization step failed:', err);
            const errorMessage = err.message || 'Authentication failed. Please check your credentials.';
            setError(errorMessage);
            if (onError) onError(errorMessage);
            setSubmitting(false);
        }
    };

    /**
     * Handle OAuth redirect
     */
    const handleOAuthConnect = () => {
        if (requirements?.type === 'oauth2' && requirements?.url) {
            window.location.href = requirements.url;
        }
    };

    // Calculate progress
    const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;
    const isLastStep = currentStep === totalSteps;

    // Loading state
    if (loading && !requirements) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                <span className="ml-3 text-sm text-muted-foreground">
                    Loading authentication...
                </span>
            </div>
        );
    }

    // Error state (initial load)
    if (error && !requirements) {
        return (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-6">
                <h3 className="text-lg font-semibold text-destructive mb-2">
                    Authentication Error
                </h3>
                <p className="text-sm text-destructive/90 mb-4">{error}</p>
                <button
                    onClick={initializeAuth}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:bg-destructive/90 text-sm"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Progress indicator (show for all multi-step flows, hide for single-step) */}
            {totalSteps > 1 && (
                <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                        <span>Step {currentStep} of {totalSteps}</span>
                        <span>{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Step content */}
            <div className="space-y-4">
                {/* Title from schema or default */}
                {requirements?.data?.jsonSchema?.title && (
                    <h3 className="text-lg font-semibold">
                        {requirements.data.jsonSchema.title}
                    </h3>
                )}

                {/* Description from schema */}
                {requirements?.data?.jsonSchema?.description && (
                    <p className="text-sm text-muted-foreground">
                        {requirements.data.jsonSchema.description}
                    </p>
                )}

                {/* Form-based auth */}
                {requirements?.type !== 'oauth2' && requirements?.data?.jsonSchema && (
                    <Form
                        schema={requirements.data.jsonSchema}
                        uiSchema={requirements.data.uiSchema || {}}
                        data={formData}
                        onChange={handleFormChange}
                    />
                )}

                {/* OAuth2 auth */}
                {requirements?.type === 'oauth2' && (
                    <div className="space-y-4 py-4">
                        <p className="text-sm text-muted-foreground">
                            Click the button below to authorize through a secure OAuth connection.
                        </p>
                        <button
                            onClick={handleOAuthConnect}
                            disabled={submitting}
                            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Authorize with OAuth
                        </button>
                    </div>
                )}

                {/* Step-specific error messages */}
                {error && (
                    <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                        <p className="text-sm text-destructive">{error}</p>
                    </div>
                )}

                {/* Server message (e.g., "OTP sent to email") */}
                {requirements?.message && (
                    <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                        <p className="text-sm text-blue-900">{requirements.message}</p>
                    </div>
                )}
            </div>

            {/* Actions - Always visible */}
            <div className="flex gap-3 justify-end pt-4 border-t border-border">
                <button
                    onClick={onCancel}
                    disabled={submitting}
                    className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors font-medium text-sm disabled:opacity-50"
                >
                    Cancel
                </button>

                {/* Submit button (not shown for OAuth since it redirects) */}
                {requirements?.type !== 'oauth2' && (
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || loading}
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {submitting && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                        )}
                        {submitting ? 'Processing...' : (isLastStep ? 'Complete' : 'Continue')}
                    </button>
                )}
            </div>
        </div>
    );
};
