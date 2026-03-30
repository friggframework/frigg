import { useState } from "react";
import { JsonForms } from '@jsonforms/react';
import { materialRenderers, materialCells } from '@jsonforms/material-renderers';
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";
import { X } from "lucide-react";

/**
 * AuthModal - Handle OAuth and form-based authentication flows
 *
 * Supports two authentication types:
 * 1. OAuth (redirect): Redirects user to external authorization URL
 * 2. Form-based: Renders JSONForms to collect credentials
 *
 * @param {object} props.authRequirements - Authorization requirements from API
 * @param {string} props.entityType - Entity type being connected (e.g., 'salesforce')
 * @param {function} props.onSubmit - Called with form data for form-based auth
 * @param {function} props.onCancel - Called when user cancels
 * @param {boolean} props.isOpen - Modal visibility
 * @returns {JSX.Element} The rendered component
 */
export default function AuthModal(props) {
  const [formData, setFormData] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!props.isOpen) return null;

  const authReqs = props.authRequirements;
  const isOAuth = authReqs?.data?.url;
  const isFormBased = authReqs?.data?.schema || authReqs?.schema;

  const handleOAuthRedirect = () => {
    const url = authReqs?.data?.url;
    if (url) {
      window.location.href = url;
    } else {
      setError('OAuth URL not found in authorization requirements');
    }
  };

  const handleFormSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await props.onSubmit(formData);
    } catch (err) {
      setError(err.message || 'Failed to submit authentication');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold capitalize">
              Connect {props.entityType}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {isOAuth ? 'You will be redirected to authorize access' : 'Enter your credentials to connect'}
            </p>
          </div>
          <button
            onClick={props.onCancel}
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

          {isOAuth && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  You will be redirected to {props.entityType} to authorize access.
                  After authorization, you'll be redirected back to complete the setup.
                </p>
              </div>

              {authReqs?.data?.instructions && (
                <div className="prose prose-sm max-w-none">
                  <p className="text-gray-700">{authReqs.data.instructions}</p>
                </div>
              )}
            </div>
          )}

          {isFormBased && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-800">
                  Enter your credentials to connect to {props.entityType}.
                </p>
              </div>

              <JsonForms
                schema={authReqs?.data?.schema || authReqs?.schema}
                uischema={authReqs?.data?.uischema || authReqs?.uischema}
                data={formData}
                renderers={materialRenderers}
                cells={materialCells}
                onChange={({ data }) => setFormData(data)}
              />
            </div>
          )}

          {!isOAuth && !isFormBased && (
            <div className="text-center py-8">
              <p className="text-gray-600">
                Unable to determine authentication type. Please check the authorization requirements.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={props.onCancel} disabled={submitting}>
            Cancel
          </Button>

          {isOAuth && (
            <Button onClick={handleOAuthRedirect} disabled={submitting}>
              Continue to {props.entityType}
            </Button>
          )}

          {isFormBased && (
            <Button onClick={handleFormSubmit} disabled={submitting}>
              {submitting ? (
                <>
                  <LoadingSpinner className="w-4 h-4 mr-2" />
                  Connecting...
                </>
              ) : (
                'Connect Account'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
