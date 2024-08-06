import Form from '@rjsf/core';
import { useEffect, useState } from 'react';
import API from '../../api/api';
import { Switch } from '../ui2/switch';

function ModalConfig({ closeConfigModal, name, type }) {
  const [jsonSchema, setJsonSchema] = useState({});
  const [uiSchema, setUiSchema] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  const api = new API();

  useEffect(() => {
    const authRequirements = async () => {
      let data = {};

      api.setJwt(sessionStorage.getItem('jwt'));
      const response = await api.getAuthorizeRequirements(type, 'demo');
      console.log('test', response);

      if (!response.data) {
        data.jsonSchema = response.jsonSchema;
        data.uiSchema = response.uiSchema;
      } else {
        data.jsonSchema = response.data.jsonSchema;
        data.uiSchema = response.data.uiSchema;
      }

      for (const element of Object.entries(data.uiSchema)) {
        if (!element['ui:widget']) {
          element['ui:widget'] = 'text';
        }
      }

      setJsonSchema(data.jsonSchema);
      setUiSchema(data.uiSchema);
      setIsLoading(false);
    };

    authRequirements();
  }, []);

  function CustomFieldTemplate(props) {
    const { id, label, help, required, description, errors, children } = props;
    return (
      <label htmlFor={id} className="block text-sm mb-4">
        <span className="text-gray-700">
          {label} {required ? '*' : null}
        </span>
        {description}
        {children}
        <p className="inline-flex pt-2 text-xs font-medium text-red-300">
          {errors}
        </p>
        <p className="inline-flex pt-2 text-xs font-medium text-red-300">
          {help}
        </p>
      </label>
    );
  }

  function InputTextWidget(props) {
    return (
      <input
        type="text"
        className="block w-full mt-1 text-sm form-input rounded-lg"
        value={props.value}
        required={props.required}
        placeholder={props.placeholder}
      />
    );
  }

  function InputPasswordWidget(props) {
    return (
      <input
        type="password"
        className="block w-full mt-1 text-sm form-input rounded-lg"
        value={props.value}
        required={props.required}
        placeholder={props.placeholder}
      />
    );
  }

  function InputCheckboxWidget(props) {
    return (
      <>
        <label htmlFor="custom-checkbox">{props.label}</label>
        <Switch
          id="custom-checkbox"
          className={props.value ? 'checked' : 'unchecked'}
          onClick={() => props.onChange(!props.value)}
          defaultChecked={props.value}
        />
      </>
    );
  }

  const widgets = {
    text: InputTextWidget,
    password: InputPasswordWidget,
    CheckboxWidget: InputCheckboxWidget,
  };

  return (
    <>
      <div className="fixed inset-0 z-30 flex items-end bg-black bg-opacity-50 sm:items-center sm:justify-center">
        <div
          className="w-full px-6 py-4 overflow-hidden bg-white rounded-t-lg sm:rounded-lg sm:m-4 sm:max-w-xl"
          role="dialog"
          id="modal"
        >
          <div className="mt-4 mb-6">
            <p className="text-lg font-semibold text-gray-700 mb-6">
              Configure {name}
            </p>

            {isLoading ? (
              <div className="flex justify-center px-8 py-8">
                <svg
                  className="animate-spin h-10 w-10 text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              </div>
            ) : null}

            <Form
              schema={jsonSchema}
              uiSchema={uiSchema}
              FieldTemplate={CustomFieldTemplate}
              widgets={widgets}
            >
              <footer className="flex flex-col items-center justify-end px-6 py-3 -mx-6 -mb-4 -mt-4 space-y-4 sm:space-y-0 sm:space-x-6 sm:flex-row">
                <button
                  onClick={closeConfigModal}
                  className="px-3 py-2 text-xs font-medium leading-5 text-center text-gray-700 transition-colors duration-150 bg-white border border-gray-300 rounded-lg hover:bg-purple-600 focus:outline-none focus:shadow-outline-gray"
                >
                  Cancel
                </button>
                <button
                  onClick={closeConfigModal}
                  className="px-3 py-2 text-xs font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
                >
                  Save
                </button>
              </footer>
            </Form>
          </div>
        </div>
      </div>
    </>
  );
}
export default ModalConfig;
