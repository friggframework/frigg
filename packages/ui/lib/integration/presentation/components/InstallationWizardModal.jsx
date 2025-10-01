/**
 * @file Installation Wizard Modal
 * @description Complete modal wizard for installing an integration
 * Orchestrates entity selection, authorization, and installation
 */

import React, { useState, useMemo } from 'react';
import { IntegrationInstallFlow } from '../flows/IntegrationInstallFlow.jsx';
import { EntityConnectionModal } from './EntityConnectionModal.jsx';
import { InstallIntegrationUseCase } from '../../application/use-cases/InstallIntegrationUseCase.js';
import { SelectEntitiesUseCase } from '../../application/use-cases/SelectEntitiesUseCase.js';
import { ConnectEntityUseCase } from '../../application/use-cases/ConnectEntityUseCase.js';
import { IntegrationService } from '../../application/services/IntegrationService.js';
import { EntityService } from '../../application/services/EntityService.js';
import { IntegrationRepositoryAdapter } from '../../infrastructure/adapters/IntegrationRepositoryAdapter.js';
import { EntityRepositoryAdapter } from '../../infrastructure/adapters/EntityRepositoryAdapter.js';
import API from '../../../api/api.js';
import { X } from 'lucide-react';

export const InstallationWizardModal = ({
    isOpen,
    onClose,
    integrationType,
    integrationDisplayName,
    friggBaseUrl,
    authToken,
    onSuccess,
    cachedIntegrationOptions = null, // Pre-loaded integration options to avoid refetch
    cachedEntities = null // Pre-loaded entities to avoid refetch
}) => {
    const [showEntityConnection, setShowEntityConnection] = useState(false);
    const [pendingEntityType, setPendingEntityType] = useState(null);

    // Initialize services and use cases
    const { installUseCase, selectUseCase, connectUseCase } = useMemo(() => {
        const api = new API(friggBaseUrl, authToken);

        const integrationRepo = new IntegrationRepositoryAdapter(api, cachedIntegrationOptions);
        const entityRepo = new EntityRepositoryAdapter(api, cachedEntities);

        const integrationService = new IntegrationService(integrationRepo);
        const entityService = new EntityService(entityRepo);

        return {
            installUseCase: new InstallIntegrationUseCase(integrationService, entityService),
            selectUseCase: new SelectEntitiesUseCase(integrationService, entityService),
            connectUseCase: new ConnectEntityUseCase(entityService)
        };
    }, [friggBaseUrl, authToken, cachedIntegrationOptions, cachedEntities]);

    const handleCreateEntity = (entityType, forIntegrationType) => {
        setPendingEntityType(entityType);
        setShowEntityConnection(true);
    };

    const handleEntityConnected = async (entity) => {
        setShowEntityConnection(false);
        setPendingEntityType(null);
        // The entity selection flow will automatically refresh and show the new entity
    };

    const handleCancelEntityConnection = () => {
        setShowEntityConnection(false);
        setPendingEntityType(null);
    };

    const handleInstallComplete = (integration) => {
        if (onSuccess) {
            onSuccess(integration);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-lg shadow-xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">
                            Install {integrationDisplayName}
                        </h2>
                        <p className="text-sm text-gray-600 mt-1">
                            Select accounts and complete the installation process
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">
                    {showEntityConnection ? (
                        <EntityConnectionModal
                            isOpen={true}
                            entityType={pendingEntityType}
                            connectEntityUseCase={connectUseCase}
                            friggBaseUrl={friggBaseUrl}
                            authToken={authToken}
                            onSuccess={handleEntityConnected}
                            onCancel={handleCancelEntityConnection}
                        />
                    ) : (
                        <IntegrationInstallFlow
                            integrationType={integrationType}
                            installIntegrationUseCase={installUseCase}
                            selectEntitiesUseCase={selectUseCase}
                            connectEntityUseCase={connectUseCase}
                            onComplete={handleInstallComplete}
                            onCancel={onClose}
                            onCreateEntity={handleCreateEntity}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
