import { useEffect, useState, useCallback } from "react";
import API from "../api/api";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";
import { ArrowRight, Check, X, Plus } from "lucide-react";
import { useIntegrationData } from "./context/IntegrationDataContext";

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
 * @returns {JSX.Element} The rendered component
 */
export default function IntegrationBuilder(props) {
  const { baseUrl, authToken } = useIntegrationData();

  // Determine if we're starting from gallery (integration type pre-selected) or entity manager (entity pre-selected)
  const startFromGallery = !!props.preselectedIntegrationType;

  const [step, setStep] = useState(1); // 1: Select Entities, 2: Select Type, 3: Configure, 4: Confirm
  const [entities, setEntities] = useState([]);
  const [integrationOptions, setIntegrationOptions] = useState([]);
  const [selectedEntities, setSelectedEntities] = useState({});
  const [selectedIntegrationType, setSelectedIntegrationType] = useState(props.preselectedIntegrationType || null);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const api = new API(baseUrl, authToken);

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
  }, [authToken, baseUrl]);

  useEffect(() => {
    if (!authToken) {
      setError("Authentication token is required");
      return;
    }
    loadData();
  }, [loadData, authToken]);

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

    if (Object.keys(selectedEntities).length < 2) {
      alert("Please select at least 2 entities to integrate");
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
            Step {step} of 4: {
              step === 1 ? "Select Accounts" :
              step === 2 ? "Choose Integration Type" :
              step === 3 ? "Configure Settings" :
              "Confirm & Create"
            }
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
                  Select accounts to connect with <strong>{selectedIntegrationType.display?.name || selectedIntegrationType.displayName || selectedIntegrationType.type}</strong>.
                  {selectedIntegrationType.requiredEntities?.length > 0 && (
                    <> Required: {selectedIntegrationType.requiredEntities.join(', ')}</>
                  )}
                </>
              ) : (
                <>
                  Select at least 2 accounts to integrate. For example, connect your
                  Salesforce CRM with your Slack workspace.
                </>
              )}
            </p>
          </div>

          {entities.length === 0 ? (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <h3 className="font-semibold mb-2">No Connected Accounts</h3>
              <p className="text-gray-600 mb-4">
                You need to connect accounts before creating integrations.
                {startFromGallery && selectedIntegrationType?.requiredEntities && (
                  <> This integration requires: <strong>{selectedIntegrationType.requiredEntities.join(', ')}</strong></>
                )}
              </p>
              <Button onClick={() => {
                alert('OAuth flow not yet implemented. This would redirect to connect accounts.');
              }}>
                Connect Accounts
              </Button>
            </div>
          ) : (
            <>
              <div className="grid gap-3">
                {entities.map((entity) => {
                  const isSelected = selectedEntities[entity.type] === entity.id;
                  return (
                    <div
                      key={entity.id}
                      onClick={() =>
                        isSelected
                          ? handleDeselectEntity(entity.type)
                          : handleSelectEntity(entity.type, entity.id)
                      }
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-300 hover:border-gray-400"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium">{entity.name}</h4>
                          <p className="text-sm text-gray-600 capitalize">
                            {entity.type}
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

              {/* Show connect more accounts option */}
              <div className="border border-dashed border-gray-300 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-600 mb-2">
                  Don't see the account you need?
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    alert('OAuth flow not yet implemented. This would redirect to connect a new account.');
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Connect New Account
                </Button>
              </div>
            </>
          )}

          <div className="flex justify-between pt-4">
            <div className="text-sm text-gray-600">
              {Object.keys(selectedEntities).length} account(s) selected
            </div>
            <Button
              onClick={() => setStep(2)}
              disabled={Object.keys(selectedEntities).length < 2}
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
                <Button onClick={() => setStep(3)}>
                  Next: Configure
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
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${
                          isSelected
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
            <Button variant="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={() => setStep(4)}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
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
            <Button variant="outline" onClick={() => setStep(3)}>
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
    </div>
  );
}