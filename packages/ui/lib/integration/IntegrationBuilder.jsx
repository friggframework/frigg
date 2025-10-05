import { useEffect, useState, useCallback } from "react";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";
import { ArrowRight, Check, X, Plus } from "lucide-react";
import { useIntegrationData } from "./context/IntegrationDataContext";
import AuthModal from "./AuthModal.jsx";

/**
 * IntegrationBuilder - Build integrations from connected entities
 *
 * Allows users to:
 * - Select which entities/accounts to connect
 * - Choose integration type
 * - Configure integration settings
 * - Confirm and create the integration
 *
 * @param {object} props.preselectedEntity - Entity to pre-select (optional)
 * @param {object} props.preselectedIntegrationType - Integration type to pre-select when starting from gallery (optional)
 * @param {function} props.onIntegrationCreated - Callback when integration is created
 * @param {function} props.onCancel - Navigate back to entity manager
 * @param {function} props.onCreateEntity - Callback when entity creation is needed (optional)
 * @returns {JSX.Element} The rendered component
 */
export default function IntegrationBuilder(props) {
  // Get shared API and redirectContext from context
  const { api, redirectContext } = useIntegrationData();

  // Debug: Track component instance
  const [instanceId] = useState(() => {
    const id = Math.random().toString(36).substr(2, 9);
    console.log(`🟢 [IntegrationBuilder ${id}] Component mounted`);
    return id;
  });

  // Determine if we're starting from gallery (integration type pre-selected) or entity manager (entity pre-selected)
  const startFromGallery = !!props.preselectedIntegrationType;

  const [step, setStep] = useState(1); // Dynamic steps based on integration requirements
  const [entities, setEntities] = useState([]);
  const [integrationOptions, setIntegrationOptions] = useState([]);
  const [selectedEntities, setSelectedEntities] = useState({});
  const [selectedIntegrationType, setSelectedIntegrationType] = useState(props.preselectedIntegrationType || null);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authRequirements, setAuthRequirements] = useState(null);
  const [connectingEntityType, setConnectingEntityType] = useState(null);

  const api = new API(effectiveBaseUrl, effectiveAuthToken);

  // Calculate total steps dynamically based on integration requirements
  const getTotalSteps = () => {
    if (startFromGallery && selectedIntegrationType) {
      // Gallery flow: 1. Select Entities, 2. Configure (if needed), 3. Confirm
      return selectedIntegrationType.hasUserConfig ? 3 : 2;
    } else {
      // Standard flow: 1. Select Entities, 2. Select Type, 3. Configure (if needed), 4. Confirm
      return 4; // Always 4 steps for standard flow
    }
  };

  const getStepTitle = (stepNumber) => {
    if (startFromGallery && selectedIntegrationType) {
      switch (stepNumber) {
        case 1: return "Select Accounts";
        case 2: return selectedIntegrationType.hasUserConfig ? "Configure Settings" : "Confirm & Create";
        case 3: return "Confirm & Create";
        default: return "Unknown Step";
      }
    } else {
      switch (stepNumber) {
        case 1: return "Select Accounts";
        case 2: return "Choose Integration Type";
        case 3: return "Configure Settings";
        case 4: return "Confirm & Create";
        default: return "Unknown Step";
      }
    }
  };

  // Handle preselected entity (from entity manager flow)
  useEffect(() => {
    if (props.preselectedEntity) {
      setSelectedEntities({
        [props.preselectedEntity.type]: props.preselectedEntity.id
      });
    }
  }, [props.preselectedEntity]);

  // Handle preselected integration type (from gallery install flow)
  useEffect(() => {
    if (props.preselectedIntegrationType) {
      setSelectedIntegrationType(props.preselectedIntegrationType);
      // Pre-populate config type
      setConfig(prev => ({
        ...prev,
        type: props.preselectedIntegrationType.type
      }));
    }
  }, [props.preselectedIntegrationType]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [entitiesResult, optionsResult] = await Promise.all([
        api.listEntities(),
        api.listIntegrationOptions()
      ]);

      if (entitiesResult?.error) throw new Error(entitiesResult.error);
      if (optionsResult?.error) throw new Error(optionsResult.error);

      setEntities(entitiesResult.entities || []);
      setIntegrationOptions(optionsResult.integrations || []);
    } catch (err) {
      console.error("Failed to load data:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!api) {
      setError("API instance is required");
      return;
    }
    loadData();
  }, [loadData, api]);

  const handleSelectEntity = (entityType, entityId) => {
    setSelectedEntities(prev => ({
      ...prev,
      [entityType]: entityId
    }));
  };

  const handleDeselectEntity = (entityType) => {
    setSelectedEntities(prev => {
      const updated = { ...prev };
      delete updated[entityType];
      return updated;
    });
  };

  const handleConnectAccount = (moduleType) => {
    console.log(`🔵 [IntegrationBuilder ${instanceId}] handleConnectAccount called for ${moduleType}`);
    console.log(`🔵 [IntegrationBuilder ${instanceId}] redirectContext:`, redirectContext);
    // MultiStepAuthWizard will fetch authorization requirements when it mounts
    // No need to pre-fetch here (was causing duplicate OAuth sessions)
    setConnectingEntityType(moduleType);
    setAuthModalOpen(true);
  };

  const handleAuthSubmit = async (formData) => {
    try {
      // Submit form-based auth data to authorize endpoint
      const result = await api.submitModuleAuthorization(connectingEntityType, formData);

      if (result?.error) {
        throw new Error(result.error);
      }

      // Close modal and refresh entities
      setAuthModalOpen(false);
      await loadData();

      // Show success message
      alert(`Successfully connected ${connectingEntityType} account!`);
    } catch (err) {
      throw new Error(err.message || 'Failed to authorize account');
    }
  };

  const getCompatibleIntegrations = () => {
    const entityTypes = Object.keys(selectedEntities);
    if (entityTypes.length < 2) return [];

    return integrationOptions.filter(option => {
      const requiredTypes = option.requiredEntities || [];
      return requiredTypes.every(type => entityTypes.includes(type));
    });
  };

  const handleCreateIntegration = async () => {
    if (!selectedIntegrationType) {
      alert("Please select an integration type");
      return;
    }

    // Validate based on integration requirements instead of hardcoded "2 entities"
    const requiredEntityTypes = selectedIntegrationType.requiredEntities || [];
    const selectedEntityTypes = Object.keys(selectedEntities);
    const missingRequiredTypes = requiredEntityTypes.filter(type => !selectedEntityTypes.includes(type));

    if (missingRequiredTypes.length > 0) {
      alert(`Please select entities for required types: ${missingRequiredTypes.join(', ')}`);
      return;
    }

    try {
      setCreating(true);

      const integrationConfig = {
        type: selectedIntegrationType.type,
        ...config
      };

      // Convert selected entities object to array of entity IDs
      const entityIds = Object.values(selectedEntities);

      const result = await api.createIntegration(
        entityIds,
        integrationConfig
      );

      if (result?.error) {
        throw new Error(result.error);
      }

      props.onIntegrationCreated?.(result);
    } catch (err) {
      alert(`Failed to create integration: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
        <span className="ml-3">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        <h3 className="font-semibold mb-2">Error Loading Data</h3>
        <p>{error}</p>
        <div className="flex gap-2 mt-3">
          <Button onClick={loadData}>Retry</Button>
          <Button variant="outline" onClick={props.onCancel}>
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Build Integration</h2>
          <p className="text-gray-600 mt-1">
            Step {step} of {getTotalSteps()}: {getStepTitle(step)}
          </p>
        </div>
        <Button variant="outline" onClick={props.onCancel}>
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
      </div>

      {/* Step 1: Select Entities */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
            <p className="text-sm">
              {startFromGallery && selectedIntegrationType ? (
                <>
                  Select or connect accounts for <strong>{selectedIntegrationType.display?.name || selectedIntegrationType.displayName || selectedIntegrationType.type}</strong>.
                </>
              ) : (
                <>
                  Select accounts for each required module to build your integration.
                </>
              )}
            </p>
          </div>

          {/* Get required entity types from selected integration or use generic 2+ requirement */}
          {(() => {
            const requiredTypes = startFromGallery && selectedIntegrationType?.requiredEntities
              ? selectedIntegrationType.requiredEntities
              : [...new Set(entities.map(e => e.type))]; // Fallback to unique types from available entities

            return (
              <div className="space-y-3">
                {requiredTypes.map((moduleType) => {
                  const availableEntities = entities.filter(e => e.type === moduleType);
                  const selectedEntityId = selectedEntities[moduleType];

                  return (
                    <div key={moduleType} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between gap-4">
                        {/* Module name */}
                        <div className="flex-shrink-0 w-32">
                          <h4 className="font-semibold capitalize text-gray-900">
                            {moduleType}
                          </h4>
                        </div>

                        {/* Dropdown or Connect button */}
                        <div className="flex-1">
                          {availableEntities.length > 0 ? (
                            <select
                              value={selectedEntityId || ''}
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleSelectEntity(moduleType, e.target.value);
                                } else {
                                  handleDeselectEntity(moduleType);
                                }
                              }}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Select {moduleType} account...</option>
                              {availableEntities.map((entity) => (
                                <option key={entity.id} value={entity.id}>
                                  {entity.name} {entity.externalId ? `(${entity.externalId})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">No {moduleType} accounts connected</span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConnectAccount(moduleType)}
                              >
                                Connect {moduleType}
                              </Button>
                            </div>
                          )}
                        </div>

                        {/* Selected indicator */}
                        {selectedEntityId && (
                          <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div className="flex justify-between pt-4">
            <div className="text-sm text-gray-600">
              {Object.keys(selectedEntities).length} account(s) selected
            </div>
            <Button
              onClick={() => setStep(2)}
              disabled={(() => {
                if (startFromGallery && selectedIntegrationType?.requiredEntities) {
                  // If starting from gallery, check if all required entities are selected
                  const requiredTypes = selectedIntegrationType.requiredEntities;
                  const selectedTypes = Object.keys(selectedEntities);
                  return !requiredTypes.every(type => selectedTypes.includes(type));
                } else {
                  // If not starting from gallery, require at least one entity to proceed
                  return Object.keys(selectedEntities).length === 0;
                }
              })()}
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select Integration Type (or show pre-selected from gallery) */}
      {step === 2 && (
        <div className="space-y-4">
          {startFromGallery && selectedIntegrationType ? (
            // Integration type already selected from gallery - show it and allow next
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
                <p className="text-sm">
                  You selected <strong>{selectedIntegrationType.display?.name || selectedIntegrationType.displayName || selectedIntegrationType.type}</strong> from the gallery.
                  Click Next to configure the integration.
                </p>
              </div>

              <div className="border border-blue-500 bg-blue-50 rounded-lg p-6">
                <div className="flex items-center gap-4">
                  {selectedIntegrationType.display?.icon && (
                    <img src={selectedIntegrationType.display.icon} alt="" className="w-16 h-16 rounded" />
                  )}
                  <div>
                    <h4 className="font-semibold text-lg">
                      {selectedIntegrationType.display?.name || selectedIntegrationType.displayName || selectedIntegrationType.type}
                    </h4>
                    <p className="text-sm text-gray-600 mt-1">
                      {selectedIntegrationType.display?.description || selectedIntegrationType.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back to Entity Selection
                </Button>
                <Button onClick={() => {
                  // Skip configuration step if no user config needed
                  const nextStep = selectedIntegrationType.hasUserConfig ? 3 : getTotalSteps();
                  setStep(nextStep);
                }}>
                  Next: {selectedIntegrationType.hasUserConfig ? 'Configure' : 'Confirm & Create'}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          ) : (
            // Standard flow - select from compatible integrations
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
                <p className="text-sm">
                  Choose the integration type that connects your selected accounts.
                </p>
              </div>

              {getCompatibleIntegrations().length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-600">
                    No compatible integrations found for the selected accounts.
                    Try selecting different accounts.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {getCompatibleIntegrations().map((option) => {
                    const isSelected = selectedIntegrationType?.type === option.type;
                    return (
                      <div
                        key={option.type}
                        onClick={() => setSelectedIntegrationType(option)}
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${isSelected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-300 hover:border-gray-400"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{option.display?.name || option.displayName}</h4>
                            <p className="text-sm text-gray-600">
                              {option.display?.description || option.description}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  disabled={!selectedIntegrationType}
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 3: Configure (placeholder for now) */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
            <p className="text-sm">
              Configuration options will appear here based on the selected
              integration type.
            </p>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => {
              // Go back to appropriate step based on flow
              const prevStep = startFromGallery ? 2 : 2;
              setStep(prevStep);
            }}>
              Back
            </Button>
            <Button onClick={() => setStep(getTotalSteps())}>
              Next: Confirm & Create
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Final Step: Confirm */}
      {step === getTotalSteps() && (
        <div className="space-y-4">
          <div className="border rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">Review & Confirm</h3>

            <div>
              <h4 className="font-medium text-sm text-gray-600 mb-2">
                Selected Accounts:
              </h4>
              <ul className="space-y-1">
                {Object.entries(selectedEntities).map(([type, entityId]) => {
                  const entity = entities.find(e => e.id === entityId);
                  return (
                    <li key={type} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-green-600" />
                      <span>{entity?.name || type}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-sm text-gray-600 mb-2">
                Integration Type:
              </h4>
              <p className="font-medium">{selectedIntegrationType?.displayName}</p>
              <p className="text-sm text-gray-600">
                {selectedIntegrationType?.description}
              </p>
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={() => {
              // Go back to configuration step if it exists, otherwise to previous step
              const prevStep = selectedIntegrationType?.hasUserConfig ? 3 : (startFromGallery ? 2 : 3);
              setStep(prevStep);
            }}>
              Back
            </Button>
            <Button onClick={handleCreateIntegration} disabled={creating}>
              {creating ? (
                <>
                  <LoadingSpinner className="w-4 h-4 mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 mr-2" />
                  Create Integration
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Auth Modal for connecting accounts */}
      <AuthModal
        isOpen={authModalOpen}
        api={api}
        moduleType={connectingEntityType}
        onSubmit={handleAuthSubmit}
        onCancel={() => {
          setAuthModalOpen(false);
          setAuthRequirements(null);
          setConnectingEntityType(null);
        }}
        redirectContext={redirectContext}
      />
    </div>
  );
}