import { useEffect, useState } from "react";
import Api from "../../api/api";

/**
 * Custom hook for shared integration logic
 *
 * @param {Object} props - Component props
 * @param {Object} props.data - Integration data
 * @param {string} props.friggBaseUrl - Base URL for Frigg service
 * @param {string} props.authToken - JWT token for authentication
 * @param {Function} props.refreshIntegrations - Function to refresh integrations
 * @returns {Object} Integration state and methods
 */
export function useIntegrationLogic(props) {
    const { data, friggBaseUrl, authToken, refreshIntegrations } = props;
    const { type, status: initialStatus, id: integrationId } = data;

    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState(initialStatus);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isInstallWizardOpen, setIsInstallWizardOpen] = useState(false);
    const [userActions, setUserActions] = useState([]);

    const api = new Api(friggBaseUrl, authToken);

    // Load user actions when component mounts
    useEffect(() => {
        if (integrationId) {
            const loadUserActions = async () => {
                try {
                    const userActionRes = await api.getUserActions(
                        integrationId,
                        "QUICK_ACTION"
                    );
                    const actions = [];
                    Object.keys(userActionRes || {}).forEach((key) => {
                        actions.push({
                            title: userActionRes[key].title,
                            description: userActionRes[key].description,
                            action: key,
                        });
                    });
                    setUserActions(actions);
                } catch (error) {
                    console.error("Error loading user actions:", error);
                }
            };
            loadUserActions();
        }
    }, [integrationId, api]);

    // Open installation wizard (replaces direct authorization)
    const openInstallWizard = () => {
        setIsInstallWizardOpen(true);
    };

    const closeInstallWizard = () => {
        setIsInstallWizardOpen(false);
        setIsProcessing(false);
    };

    const handleInstallSuccess = async (integration) => {
        setIsInstallWizardOpen(false);
        setStatus('ENABLED');
        if (refreshIntegrations) {
            await refreshIntegrations(props);
        }
    };

    // Legacy: Get authorization requirements (kept for backward compatibility)
    const getAuthorizeRequirements = async () => {
        // Now just opens the install wizard instead
        openInstallWizard();
    };

    // Modal management functions
    const openAuthModal = () => setIsAuthModalOpen(true);
    const closeAuthModal = () => {
        setIsAuthModalOpen(false);
        setIsProcessing(false);
    };

    const openConfigModal = () => setIsConfigModalOpen(true);
    const closeConfigModal = () => {
        setIsConfigModalOpen(false);
        setIsProcessing(false);
    };

    // Disconnect integration
    const disconnectIntegration = async () => {
        try {
            await api.deleteIntegration(integrationId);
            setIsProcessing(true);
            setStatus(false);
            await refreshIntegrations(props);
            setIsProcessing(false);
        } catch (error) {
            console.error("Error disconnecting integration:", error);
            setIsProcessing(false);
        }
    };

    // Get sample data (placeholder implementation)
    const getSampleData = async () => {
        // This could be implemented based on specific requirements
        console.log("Sample data functionality not yet implemented");
    };

    return {
        // State
        isProcessing,
        status,
        isAuthModalOpen,
        isConfigModalOpen,
        isInstallWizardOpen,
        userActions,

        // Methods
        getAuthorizeRequirements,
        openInstallWizard,
        closeInstallWizard,
        handleInstallSuccess,
        disconnectIntegration,
        getSampleData,
        openAuthModal,
        closeAuthModal,
        openConfigModal,
        closeConfigModal,

        // Computed values
        api,
        integrationId,
    };
}
