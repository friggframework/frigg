/**
 * @file Integration Card Component
 * @description Display an integration option or installed integration
 */

import React from 'react';

export const IntegrationCard = ({
    integration,
    onClick,
    showStatus = false,
    showModules = true,
    showDescription = true,
    actionButton = null,
    className = ''
}) => {
    const handleClick = () => {
        if (onClick) {
            onClick(integration);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'ENABLED':
            case 'active':
                return 'green';
            case 'DISABLED':
            case 'inactive':
                return 'gray';
            case 'ERROR':
            case 'error':
                return 'red';
            case 'NEEDS_CONFIG':
                return 'yellow';
            default:
                return 'gray';
        }
    };

    return (
        <div
            className={`integration-card ${className}`}
            onClick={handleClick}
            role={onClick ? 'button' : 'article'}
            tabIndex={onClick ? 0 : undefined}
        >
            {integration.logo && (
                <div className="integration-card-logo">
                    <img src={integration.logo} alt={`${integration.displayName} logo`} />
                </div>
            )}

            <div className="integration-card-content">
                <div className="integration-card-header">
                    <h3>{integration.displayName}</h3>
                    {showStatus && integration.status && (
                        <span
                            className={`integration-card-status status-${getStatusColor(integration.status)}`}
                        >
                            {integration.status}
                        </span>
                    )}
                </div>

                {showDescription && integration.description && (
                    <p className="integration-card-description">{integration.description}</p>
                )}

                {showModules && integration.modules && Object.keys(integration.modules).length > 0 && (
                    <div className="integration-card-modules">
                        {Object.entries(integration.modules).map(([key, module]) => (
                            <span key={key} className="integration-card-module-tag">
                                {module.name || key}
                            </span>
                        ))}
                    </div>
                )}

                {integration.category && (
                    <span className="integration-card-category">{integration.category}</span>
                )}
            </div>

            {actionButton && (
                <div className="integration-card-action">
                    {actionButton}
                </div>
            )}
        </div>
    );
};
