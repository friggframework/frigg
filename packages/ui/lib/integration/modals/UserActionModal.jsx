import { Form } from "../Form";
import { useEffect, useMemo, useState } from "react";
import API from "../../api/api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import { Button } from "../../components/button.jsx";
import { useToast } from "../../components/use-toast";

function UserActionModal({
  closeConfigModal,
  integrationId,
  initialData,
  userActionDetails,
  friggBaseUrl,
  authToken,
}) {
  const [jsonSchema, setJsonSchema] = useState({});
  const [uiSchema, setUiSchema] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState(initialData);
  const api = useMemo(
    () => new API(friggBaseUrl, authToken),
    [friggBaseUrl, authToken]
  );
  const { toast } = useToast();

  useEffect(() => {
    getUserActionOptions({
      api,
      integrationId,
      selectedUserAction: userActionDetails.action,
      initialData,
    })
      .then((response) => {
        setJsonSchema(response.jsonSchema);
        setUiSchema(response.uiSchema);
        setFormData(response.data);
      })
      .finally(() => setIsLoading(false));
  }, [api, integrationId, userActionDetails.action]);

  const onChange = (formData) => {
    setFormData(formData.data);
  };

  const onSubmit = async () => {
    setIsLoading(true);
    const response = await api.submitUserAction(
      integrationId,
      userActionDetails.action,
      formData
    );

    if (!response || response.error) {
      alert(`failed to submit user action`);
      setIsLoading(false);
      return;
    }
    toast({
      variant: "success",
      title: "Success!",
      description: "User action executed successfully!",
    });

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
          <div>
            <h3 className="font-semibold text-gray-700">
              {userActionDetails.title}
            </h3>
            {userActionDetails.description && (
              <p className="text-sm text-muted-foreground">
                {userActionDetails.description}
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center align-items-center">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="flex flex-col h-full gap-3">
              <div className="flex-1">
                {Object.keys(jsonSchema).length === 0 ? (
                  <p></p>
                ) : (
                  <Form
                    //todo: set form type here? formType={FormType.USER_ACTION}
                    schema={jsonSchema}
                    uiSchema={uiSchema}
                    data={formData}
                    onChange={onChange}
                  />
                )}
              </div>

              <footer className="flex flex-col items-center justify-end px-6 py-3 -mx-6 -mb-4 -mt-4 space-y-4 sm:space-y-0 sm:space-x-6 sm:flex-row">
                <Button variant="secondary" onClick={closeConfigModal}>
                  Cancel
                </Button>
                <Button onClick={onSubmit}>Submit</Button>
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default UserActionModal;

const getUserActionOptions = async ({
  api,
  integrationId,
  selectedUserAction,
  initialData,
}) => {
  const response = await api.getUserActionOptions(
    integrationId,
    selectedUserAction,
    { ...initialData }
  );

  return {
    jsonSchema: response.jsonSchema,
    uiSchema: response.uiSchema,
    data: response.data,
  };
};
