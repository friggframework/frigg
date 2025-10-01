/**
 * @file Entity Selector Component
 * @description Select entities for a specific integration type
 * Handles required/optional entity types and validation
 */

import React, { useState, useEffect } from 'react';
import { EntityCard } from './EntityCard.jsx';

export const EntitySelector = ({
    requirements,
    onSelectionChange,
    onCreateEntity,
    initialSelections = {},
    showCreateButton = true
}) => {
    const [selections, setSelections] = useState(initialSelections);
    const [validationErrors, setValidationErrors] = useState([]);

    useEffect(() => {
        setSelections(initialSelections);
    }, [initialSelections]);

    useEffect(() => {
        // Validate and notify parent
        const errors = validateSelections();
        setValidationErrors(errors);

        if (onSelectionChange) {
            onSelectionChange(selections, errors.length === 0);
        }
    }, [selections]);

    const validateSelections = () => {
        const errors = [];

        // Check all required types have selections
        for (const req of requirements.required) {
            if (!selections[req.type]) {
                errors.push({
                    type: req.type,
                    message: `${req.label} is required`
                });
            }
        }

        return errors;
    };

    const handleSelectEntity = (type, entity) => {
        setSelections(prev => ({
            ...prev,
            [type]: entity.id
        }));
    };

    const handleCreateEntity = (type) => {
        if (onCreateEntity) {
            onCreateEntity(type);
        }
    };

    const renderEntityTypeSection = (requirement, isRequired = true) => {
        const { type, label, entities, hasEntities } = requirement;
        const selectedId = selections[type];

        return (
            <div key={type} className="mb-6 p-4 border border-border rounded-lg bg-card">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-foreground">
                        {label}
                        {isRequired && <span className="text-destructive ml-1">*</span>}
                    </h3>
                    {!hasEntities && (
                        <span className="text-sm text-muted-foreground">No connected accounts</span>
                    )}
                </div>

                {hasEntities ? (
                    <div className="grid gap-3">
                        {entities.map(entity => (
                            <EntityCard
                                key={entity.id}
                                entity={entity}
                                selected={selectedId === entity.id}
                                onSelect={() => handleSelectEntity(type, entity)}
                                disabled={!entity.isConnected()}
                                showStatus={true}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 px-4 bg-muted/50 rounded-md border border-dashed border-border">
                        <p className="text-sm text-muted-foreground mb-3">
                            You don't have any {label} connected yet.
                        </p>
                        {showCreateButton && (
                            <button
                                className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors font-medium text-sm"
                                onClick={() => handleCreateEntity(type)}
                            >
                                Connect {label}
                            </button>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                            {isRequired && `${label} is required`}
                        </p>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">Select Accounts</h2>
                <p className="text-sm text-muted-foreground">
                    Choose which accounts to use for this integration
                </p>
            </div>

            {/* Required entities */}
            {requirements.required.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-medium text-foreground uppercase tracking-wide">
                        Required Accounts
                    </h3>
                    {requirements.required.map(req => renderEntityTypeSection(req, true))}
                </div>
            )}

            {/* Optional entities */}
            {requirements.optional.length > 0 && (
                <div className="space-y-4 mt-6">
                    <h3 className="text-sm font-medium text-foreground uppercase tracking-wide">
                        Optional Accounts
                    </h3>
                    {requirements.optional.map(req => renderEntityTypeSection(req, false))}
                </div>
            )}

            {/* Validation errors */}
            {validationErrors.length > 0 && (
                <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
                    {validationErrors.map((error, idx) => (
                        <div key={idx} className="text-sm text-destructive flex items-center gap-2">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                            {error.message}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
