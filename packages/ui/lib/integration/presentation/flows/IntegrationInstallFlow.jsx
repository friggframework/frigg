/**
 * @file Integration Install Flow
 * @description Main flow component for installing integrations
 * Orchestrates entity selection, validation, and installation process
 */

import React, { useState, useEffect } from 'react';
import { EntitySelector } from '../components/EntitySelector.jsx';
import { AuthorizationWizard } from '../components/AuthorizationWizard.jsx';
import { Button } from '../../../components/button.jsx';
import { LoadingSpinner } from '../../../components/LoadingSpinner.jsx';
import { ArrowRight, ArrowLeft, Check, AlertCircle } from 'lucide-react';

export const IntegrationInstallFlow = ({
    integrationType,
    installIntegrationUseCase,
    selectEntitiesUseCase,
    connectEntityUseCase,
    onComplete,
    onCancel,
    onCreateEntity
}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [totalSteps, setTotalSteps] = useState(2);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Entity selection state
    const [entityRequirements, setEntityRequirements] = useState(null);
    const [selectedEntities, setSelectedEntities] = useState({});
    const [entityValidation, setEntityValidation] = useState({ valid: true, errors: [] });
    
    // Installation state
    const [installing, setInstalling] = useState(false);
    const [installationError, setInstallationError] = useState(null);

    // Calculate total steps dynamically
    useEffect(() => {
        const calculateSteps = () => {
            let steps = 1; // Entity selection
            
            if (entityRequirements?.required?.some(req => !req.hasEntities)) {
                steps += 1; // Entity connection step
            }
            
            steps += 1; // Installation step
            return steps;
        };

        if (entityRequirements) {
            setTotalSteps(calculateSteps());
        }
    }, [entityRequirements]);

    // Load entity requirements on mount
    useEffect(() => {
        loadEntityRequirements();
    }, [integrationType]);

    const loadEntityRequirements = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const requirements = await selectEntitiesUseCase.getSelectionRequirements(integrationType);
            setEntityRequirements(requirements);
            
            // Get default selections
            const defaults = await selectEntitiesUseCase.getDefaultSelections(integrationType);
            setSelectedEntities(defaults);
            
        } catch (err) {
            console.error('Failed to load entity requirements:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEntitySelection = (entityType, entityId) => {
        const newSelections = {
            ...selectedEntities,
            [entityType]: entityId
        };
        setSelectedEntities(newSelections);
        
        // Validate selections
        validateSelections(newSelections);
    };

    const validateSelections = async (selections) => {
        try {
            const validation = await selectEntitiesUseCase.validateSelections(integrationType, selections);
            setEntityValidation(validation);
        } catch (err) {
            console.error('Validation failed:', err);
            setEntityValidation({ valid: false, errors: [{ message: err.message }] });
        }
    };

    const handleCreateEntity = (entityType) => {
        if (onCreateEntity) {
            onCreateEntity(entityType, integrationType);
        }
    };

    const handleInstall = async () => {
        try {
            setInstalling(true);
            setInstallationError(null);
            
            const entityIds = Object.values(selectedEntities).filter(Boolean);
            const integration = await installIntegrationUseCase.execute(integrationType, entityIds);
            
            if (onComplete) {
                onComplete(integration);
            }
        } catch (err) {
            console.error('Installation failed:', err);
            setInstallationError(err.message);
        } finally {
            setInstalling(false);
        }
    };

    const getStepTitle = (step) => {
        switch (step) {
            case 1: return 'Select Entities';
            case 2: return 'Connect Missing Entities';
            case 3: return 'Install Integration';
            default: return 'Unknown Step';
        }
    };

    const canProceedToNext = () => {
        if (currentStep === 1) {
            return entityValidation.valid && Object.keys(selectedEntities).length > 0;
        }
        return true;
    };

    const getNextStep = () => {
        if (currentStep === 1) {
            // Check if we need entity connection step
            const needsConnection = entityRequirements?.required?.some(req => !req.hasEntities);
            return needsConnection ? 2 : 3;
        }
        return currentStep + 1;
    };

    const getPrevStep = () => {
        if (currentStep === 2) {
            return 1; // Back to entity selection
        }
        if (currentStep === 3) {
            // Check if we had entity connection step
            const needsConnection = entityRequirements?.required?.some(req => !req.hasEntities);
            return needsConnection ? 2 : 1;
        }
        return currentStep - 1;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
                <span className="ml-3 text-sm text-muted-foreground">
                    Loading integration requirements...
                </span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-6">
                <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    <h3 className="text-lg font-semibold text-destructive">
                        Error Loading Integration
                    </h3>
                </div>
                <p className="text-sm text-destructive/90 mb-4">{error}</p>
                <div className="flex gap-2">
                    <Button onClick={loadEntityRequirements} variant="outline">
                        Retry
                    </Button>
                    <Button onClick={onCancel} variant="outline">
                        Cancel
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Progress indicator */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Step {currentStep} of {totalSteps}</span>
                    <span>{Math.round((currentStep / totalSteps) * 100)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                    />
                </div>
            </div>

            {/* Step content */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">
                    {getStepTitle(currentStep)}
                </h3>

                {/* Step 1: Entity Selection */}
                {currentStep === 1 && entityRequirements && (
                    <EntitySelector
                        requirements={entityRequirements}
                        selectedEntities={selectedEntities}
                        onEntitySelect={handleEntitySelection}
                        onCreateEntity={handleCreateEntity}
                        validation={entityValidation}
                    />
                )}

                {/* Step 2: Entity Connection (if needed) */}
                {currentStep === 2 && (
                    <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-800">
                                Some required entities need to be connected. Please connect the missing entities to continue.
                            </p>
                        </div>
                        
                        {entityRequirements?.required?.filter(req => !req.hasEntities).map(req => (
                            <div key={req.type} className="border rounded-lg p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-medium">{req.label}</h4>
                                        <p className="text-sm text-muted-foreground">
                                            No {req.type} accounts connected
                                        </p>
                                    </div>
                                    <Button
                                        onClick={() => handleCreateEntity(req.type)}
                                        variant="outline"
                                    >
                                        Connect {req.type}
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Step 3: Installation */}
                {currentStep === 3 && (
                    <div className="space-y-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Check className="w-5 h-5 text-green-600" />
                                <h4 className="font-medium text-green-800">Ready to Install</h4>
                            </div>
                            <p className="text-sm text-green-700">
                                All required entities are connected. Click install to create your integration.
                            </p>
                        </div>

                        {/* Selected entities summary */}
                        <div className="border rounded-lg p-4">
                            <h4 className="font-medium mb-3">Selected Entities:</h4>
                            <ul className="space-y-2">
                                {Object.entries(selectedEntities).map(([type, entityId]) => {
                                    const entity = entityRequirements?.required?.find(req => req.type === type)
                                        ?.entities?.find(e => e.id === entityId);
                                    return (
                                        <li key={type} className="flex items-center gap-2">
                                            <Check className="w-4 h-4 text-green-600" />
                                            <span className="text-sm">
                                                {entity?.name || type} ({type})
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>

                        {installationError && (
                            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
                                <p className="text-sm text-destructive">{installationError}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between pt-4 border-t border-border">
                <Button
                    onClick={() => setCurrentStep(getPrevStep())}
                    disabled={currentStep === 1}
                    variant="outline"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </Button>

                {currentStep < totalSteps ? (
                    <Button
                        onClick={() => setCurrentStep(getNextStep())}
                        disabled={!canProceedToNext()}
                    >
                        Next
                        <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                ) : (
                    <Button
                        onClick={handleInstall}
                        disabled={installing || !canProceedToNext()}
                    >
                        {installing ? (
                            <>
                                <LoadingSpinner className="w-4 h-4 mr-2" />
                                Installing...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4 mr-2" />
                                Install Integration
                            </>
                        )}
                    </Button>
                )}
            </div>
        </div>
    );
};
