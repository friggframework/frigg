/**
 * @file Entity Connection Modal
 * @description Modal for connecting a new entity
 *
 * Uses unified AuthorizationWizard that treats all auth flows as multi-step.
 * Single-step auth is just a special case with totalSteps: 1.
 */

import React, { useMemo } from 'react';
import { AuthorizationWizard } from './AuthorizationWizard';
import API from '../../../api/api.js';

export const EntityConnectionModal = ({
    isOpen,
    moduleType,
    friggBaseUrl,
    authToken,
    onSuccess,
    onCancel,
    context = {}
}) => {
    const api = useMemo(() => new API(friggBaseUrl, authToken), [friggBaseUrl, authToken]);

    if (!isOpen) return null;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">
                    Connect {moduleType}
                </h2>
                <p className="text-sm text-muted-foreground">
                    Complete the authorization process to connect your account
                </p>
            </div>

            {/* Unified Authorization Wizard */}
            <AuthorizationWizard
                api={api}
                moduleType={moduleType}
                onSuccess={onSuccess}
                onCancel={onCancel}
            />
        </div>
    );
};
