import { Form } from '../../Form';
import { useEffect, useState } from 'react';
import API from '../../../api/api';
import { LoadingSpinner } from '../../LoadingSpinner';
import { useToast } from '../../ui2/use-toast';

function FormBasedAuthModal({
  closeAuthModal,
  name,
  entityType,
  refreshIntegrations,
}) {
  const api = new API();
  const [isLoading, setIsLoading] = useState(true);
  const [uiSchema, setUiSchema] = useState({});
  const [jsonSchema, setJsonSchema] = useState({});
  const [formData, setFormData] = useState({});
  const { toast } = useToast();

  useEffect(() => {
    getAuthorizationRequirements({
      entityType,
      name,
      api,
      closeAuthModal,
    })
      .then((data) => {
        if (data) {
          setJsonSchema(data.jsonSchema);
          setUiSchema(data.uiSchema);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const onChange = (formData) => {
    setFormData(formData.data);
  };

  async function onSubmit() {
    setIsLoading(true);
    const res = await authorize({ api, entityType, authData: formData });

    if (!res) {
      alert(`failed to POST /api/authorize ${this.props.targetEntityType} `);
      setIsLoading(false);
      return; // skip login
    }

    if (res.error) {
      alert(
        `'failed to POST /api/authorize ${entityType} ...  authorizeData: ${JSON.stringify(
          res
        )}`
      );
      setIsLoading(false);
    }

    // FIXME duplicated code with AuthRedirect.js
    // TODO change, for now using the target entity twice
    const integration = await this.api.createIntegration(
      res.entity_id,
      res.entity_id,
      { entity: entityType }
    );

    await refreshIntegrations();
    toast({
      variant: 'success',
      title: 'Success!',
      description: 'Authorization successful!',
    });

    if (integration.status === 'ENABLED') {
      closeAuthModal();
    } else if (integration.status === 'NEEDS_CONFIG') {
      closeAuthModal();
      //todo: an alternative here is to open the config modal right after the auth modal closes
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black bg-opacity-50 sm:items-center sm:justify-center">
      <div
        className="w-full px-6 py-4 overflow-hidden bg-white rounded-t-lg sm:rounded-lg sm:m-4 sm:max-w-xl"
        role="dialog"
        id="modal"
      >
        <div className="flex flex-col h-full gap-4">
          <p className="text-lg font-semibold text-gray-700">
            Authorize {name}
          </p>

          {isLoading ? (
            <div className="flex justify-center align-items-center">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="flex flex-col h-full gap-3">
              <div className="flex-1">
                <Form
                  schema={jsonSchema}
                  uiSchema={uiSchema}
                  data={formData}
                  onChange={onChange}
                />
              </div>

              <footer className="flex flex-col items-center justify-end px-6 py-3 -mx-6 -mb-4 -mt-4 space-y-4 sm:space-y-0 sm:space-x-6 sm:flex-row">
                <button
                  onClick={() => closeAuthModal()}
                  className="px-3 py-2 text-xs font-medium leading-5 text-center text-gray-700 transition-colors duration-150 bg-white border border-gray-300 rounded-lg hover:bg-purple-600 focus:outline-none focus:shadow-outline-gray"
                >
                  Cancel
                </button>
                <button
                  onClick={onSubmit}
                  className="px-3 py-2 text-xs font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
                >
                  Connect
                </button>
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FormBasedAuthModal;

async function getAuthorizationRequirements({
  entityType,
  name,
  api,
  closeAuthModal,
}) {
  api.setJwt(sessionStorage.getItem('jwt'));
  const authorizeData = await api.getAuthorizeRequirements(entityType, name);

  if (authorizeData.type === 'oauth2') {
    window.open(authorizeData.url, '_blank');
    closeAuthModal();
    return;
  }

  const data = authorizeData.data;
  for (const element of Object.entries(data.uiSchema)) {
    if (!element['ui:widget']) {
      element['ui:widget'] = 'text';
    }
  }

  return {
    jsonSchema: data.jsonSchema,
    uiSchema: data.uiSchema,
  };
}

async function authorize({ api, entityType, authData }) {
  api.setJwt(sessionStorage.getItem('jwt'));

  try {
    return await api.authorize(entityType, authData);
  } catch (e) {
    console.error(e);
    alert('Authorization failed. Incorrect username or password');
    throw Error('Authorization failed', e);
  }
}
