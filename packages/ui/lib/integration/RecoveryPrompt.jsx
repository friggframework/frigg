import { useState, useEffect } from 'react';
import { Button } from '../components/button.jsx';
import { LoadingSpinner } from '../components/LoadingSpinner.jsx';
import { AlertCircle, RefreshCw, X } from 'lucide-react';

/**
 * RecoveryPrompt - Detects and prompts user to resume incomplete authorizations
 *
 * Implements multi-layer recovery system:
 * - Layer 1: localStorage session recovery (handled by wizard)
 * - Layer 2: Orphaned credentials
 * - Layer 3: Pending sessions (future)
 *
 * @param {object} api - API instance
 * @param {function} onResume - Callback when user resumes (moduleType, resumedSession)
 * @param {function} onDismiss - Callback when user dismisses prompt
 * @returns {JSX.Element}
 */
export default function RecoveryPrompt({ api, onResume, onDismiss }) {
  const [recoveryOptions, setRecoveryOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [resuming, setResuming] = useState(null);

  useEffect(() => {
    checkRecoveryOptions();
  }, []);

  const checkRecoveryOptions = async () => {
    setLoading(true);
    const options = [];

    try {
      // Layer 2: Check for orphaned credentials
      const orphanedResult = await api.listCredentials({ status: 'orphaned' });

      orphanedResult.credentials?.forEach(cred => {
        options.push({
          type: 'orphaned_credential',
          id: cred.id,
          moduleType: cred.moduleType,
          message: `Complete your ${cred.moduleType} setup`,
          description: 'You started connecting this account but didn\'t finish.',
          action: 'resume_from_credential',
          createdAt: cred.createdAt
        });
      });

      // Sort by most recent first
      options.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    } catch (error) {
      console.error('Failed to check recovery options:', error);
    }

    setRecoveryOptions(options);
    setLoading(false);
  };

  const handleResume = async (option) => {
    setResuming(option.id);

    try {
      if (option.action === 'resume_from_credential') {
        const resumed = await api.resumeFromCredential(option.id);

        // Store session info for wizard
        localStorage.setItem(`auth_session_${option.moduleType}`, resumed.sessionId);
        localStorage.setItem(`auth_credential_${option.moduleType}`, option.id);
        localStorage.setItem(`auth_step_${option.moduleType}`, resumed.step.toString());

        onResume(option.moduleType, resumed);
      }
    } catch (error) {
      console.error('Failed to resume:', error);
      alert(`Failed to resume authorization: ${error.message}`);
    } finally {
      setResuming(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  const handleIgnoreOption = async (optionId) => {
    // Remove from UI immediately
    setRecoveryOptions(prev => prev.filter(opt => opt.id !== optionId));

    // Could optionally call API to delete the orphaned credential
    // await api.deleteCredential(optionId);
  };

  if (loading) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <LoadingSpinner />
          <span className="text-sm text-blue-800">
            Checking for incomplete setups...
          </span>
        </div>
      </div>
    );
  }

  if (dismissed || recoveryOptions.length === 0) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-1">
              Incomplete Setups Found
            </h3>
            <p className="text-sm text-yellow-800 mb-4">
              You have {recoveryOptions.length} incomplete authorization{recoveryOptions.length !== 1 ? 's' : ''}.
              Would you like to complete {recoveryOptions.length === 1 ? 'it' : 'them'}?
            </p>

            <div className="space-y-3">
              {recoveryOptions.map((option) => (
                <div
                  key={option.id}
                  className="bg-white border border-yellow-300 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-gray-900 capitalize">
                          {option.moduleType}
                        </h4>
                        <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                          Incomplete
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">
                        {option.description}
                      </p>
                      {option.createdAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          Started {new Date(option.createdAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleResume(option)}
                        disabled={resuming === option.id}
                      >
                        {resuming === option.id ? (
                          <>
                            <LoadingSpinner />
                            <span className="ml-2">Resuming...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Complete Setup
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleIgnoreOption(option.id)}
                        disabled={resuming === option.id}
                      >
                        Ignore
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-yellow-600 hover:text-yellow-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
