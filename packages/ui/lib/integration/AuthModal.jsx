import { useState } from "react";
import { X } from "lucide-react";
import MultiStepAuthWizard from "./MultiStepAuthWizard.jsx";

/**
 * AuthModal - Handle OAuth and form-based authentication flows
 *
 * Powered by MultiStepAuthWizard for unified single-step and multi-step support
 *
 * Supports two authentication types:
 * 1. OAuth (redirect): Redirects user to external authorization URL
 * 2. Form-based: Renders JSONForms to collect credentials
 * 3. Multi-step flows: Wizard handles progression through multiple steps
 *
 * @param {object} props.api - API instance (required)
 * @param {string} props.moduleType - Module type being connected (e.g., 'salesforce')
 * @param {function} props.onSubmit - Called with entity data on success
 * @param {function} props.onCancel - Called when user cancels
 * @param {boolean} props.isOpen - Modal visibility
 *
 * @returns {JSX.Element} The rendered component
 */
export default function AuthModal(props) {
  const [error, setError] = useState(null);

  if (!props.isOpen) return null;

  if (!props.api || !props.moduleType) {
    throw new Error('AuthModal requires api and moduleType props');
  }

  const handleSuccess = (entity) => {
    setError(null);
    props.onSubmit?.(entity);
  };

  const handleCancel = () => {
    setError(null);
    props.onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold capitalize">
              Connect {props.moduleType}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Follow the steps below to connect your account
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 mb-4">
              <p className="font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          <MultiStepAuthWizard
            api={props.api}
            moduleType={props.moduleType}
            onSuccess={handleSuccess}
            onCancel={handleCancel}
            redirectContext={props.redirectContext}
          />
        </div>
      </div>
    </div>
  );
}
