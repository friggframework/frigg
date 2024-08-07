import { Form } from "../Form";
import { useEffect, useState } from "react";
import API from "../../api/api";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import FormType from "../../enums/FormType";
import { Button } from "../../components/button";
import { useToast } from "../../components/use-toast";

function UserActionModal({
  closeConfigModal,
  name,
  integrationId,
  userActionDetails,
}) {
  const [jsonSchema, setJsonSchema] = useState({});
  const [uiSchema, setUiSchema] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const api = new API();
  const { toast } = useToast();

  useEffect(() => {
    getUserActionOptions({
      api,
      integrationId,
      selectedUserAction: userActionDetails.action,
    })
      .then((response) => {
        setJsonSchema(response.jsonSchema);
        setUiSchema(response.uiSchema);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const onChange = (formData) => {
    setFormData(formData.data);
  };

  const onSubmit = async () => {
    setIsLoading(true);
    api.setJwt(sessionStorage.getItem("jwt"));
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
}) => {
  api.setJwt(sessionStorage.getItem("jwt"));
  const response = await api.getUserActionOptions(
    integrationId,
    selectedUserAction
  );

  return {
    jsonSchema: response.jsonSchema,
    uiSchema: response.uiSchema,
  };
};
