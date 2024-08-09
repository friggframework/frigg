import { Form } from "../Form";
import { useEffect, useMemo, useState } from "react";
import API from "../../api/api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Button } from "../../components/button.jsx";
import { useToast } from "../../components/use-toast";

function IntegrationConfigurationModal({
  closeConfigModal,
  name,
  refreshIntegrations,
  integrationId,
  friggBaseUrl,
  authToken,
  ...props
}) {
  const [jsonSchema, setJsonSchema] = useState({});
  const [uiSchema, setUiSchema] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const { toast } = useToast();

  const api = useMemo(
    () => new API(friggBaseUrl, authToken),
    [friggBaseUrl, authToken]
  );

  useEffect(() => {
    getIntegrationConfigOptions({ api, integrationId })
      .then((response) => {
        setJsonSchema(response.jsonSchema);
        setUiSchema(response.uiSchema);
        setFormData(response.data);
      })
      .finally(() => setIsLoading(false));
  }, [api, integrationId]);

  const onChange = (formData) => {
    setFormData(formData.data);
  };

  const onSubmit = async () => {
    setIsLoading(true);
    const response = await api.updateIntegration(integrationId, formData);

    if (!response || response.error) {
      alert(`'failed to update the Integration`);
      setIsLoading(false);
      return;
    }
    toast({
      variant: "success",
      title: "Success!",
      description: "Configuration updated successfully!",
    });
    await refreshIntegrations(props);
    closeConfigModal();
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black bg-opacity-50 sm:items-center sm:justify-center">
      <div
        className="w-full px-6 py-4 overflow-hidden bg-white rounded-t-lg sm:rounded-lg sm:m-4 sm:max-w-xl"
        role="dialog"
        id="modal"
      >
        <div className="flex flex-col h-full gap-4">
          <p className="text-lg font-semibold text-gray-700">
            Configure {name}
          </p>

          {isLoading ? (
            <div className="flex justify-center align-items-center">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="flex flex-col h-full gap-3">
              <div className="flex-1">
                {!jsonSchema || Object.keys(jsonSchema).length === 0 ? (
                  <p>There is no configuration available!</p>
                ) : (
                  <Form
                    schema={jsonSchema}
                    uiSchema={uiSchema}
                    data={formData}
                    onChange={onChange}
                  />
                )}
              </div>

              <footer className="flex flex-col items-center justify-end px-6 py-3 -mx-6 -mb-4 -mt-4 space-y-4 sm:space-y-0 sm:space-x-6 sm:flex-row">
                <Button onClick={closeConfigModal} variant="secondary">
                  Cancel
                </Button>
                {jsonSchema && Object.keys(jsonSchema).length > 0 && (
                  <Button onClick={onSubmit}>Save</Button>
                )}
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default IntegrationConfigurationModal;

const getIntegrationConfigOptions = async ({ api, integrationId }) => {
  const response = await api.getIntegrationConfigOptions(integrationId);

  return {
    jsonSchema: response.jsonSchema,
    uiSchema: response.uiSchema,
    data: response.data,
  };
};
