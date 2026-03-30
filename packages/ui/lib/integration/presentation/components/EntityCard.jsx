/**
 * @file Entity Card Component
 * @description Displays a single entity (connected account) as a selectable card
 */

import React from 'react';

export const EntityCard = ({
    entity,
    selected = false,
    onSelect,
    disabled = false,
    showStatus = true,
    showCompatibility = false
}) => {
    const getStatusColor = (status) => {
        switch (status) {
            case 'CONNECTED':
                return 'green';
            case 'DISCONNECTED':
                return 'gray';
            case 'ERROR':
                return 'red';
            default:
                return 'gray';
        }
    };

    const getStatusLabel = (status) => {
        switch (status) {
            case 'CONNECTED':
                return 'Connected';
            case 'DISCONNECTED':
                return 'Disconnected';
            case 'ERROR':
                return 'Error';
            default:
                return status;
        }
    };

    const handleClick = () => {
        if (!disabled && onSelect) {
            onSelect(entity);
        }
    };

    return (
        <div
            className={`entity-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={handleClick}
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={selected}
            aria-disabled={disabled}
        >
            <div className="entity-card-header">
                <div className="entity-card-title">
                    <h4>{entity.getDisplayName()}</h4>
                    <span className="entity-card-type">{entity.type}</span>
                </div>
                {showStatus && (
                    <span
                        className={`entity-card-status status-${getStatusColor(entity.status)}`}
                    >
                        {getStatusLabel(entity.status)}
                    </span>
                )}
            </div>

            {entity.externalId && (
                <div className="entity-card-detail">
                    <span className="entity-card-label">ID:</span>
                    <span className="entity-card-value">{entity.externalId}</span>
                </div>
            )}

            {showCompatibility && entity.compatibleIntegrations.length > 0 && (
                <div className="entity-card-compatibility">
                    <span className="entity-card-label">Compatible with:</span>
                    <div className="entity-card-integrations">
                        {entity.compatibleIntegrations.map((integration, idx) => (
                            <span key={idx} className="entity-card-integration-tag">
                                {integration.displayName}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {selected && (
                <div className="entity-card-selected-indicator">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                    </svg>
                </div>
            )}
        </div>
    );
};
