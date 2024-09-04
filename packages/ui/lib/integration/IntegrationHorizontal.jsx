import React, { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import Api from "./../api/api";
import QuickActionsMenu from "./QuickActionsMenu";
import { FormBasedAuthModal, IntegrationConfigurationModal } from "./modals";
import { Switch } from "../components/switch";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner";

/**
 * IntegrationHorizontal component
 *
 * @param {Object} props - The component props
 * @param {Object} props.data - The data object
 * @param {Object} props.data.display - Display properties
 * @param {string} props.data.display.name - The name to display
 * @param {string} props.data.display.description - The description to display
 * @param {string} props.data.display.icon - The icon to display
 * @param {string} props.data.type - The type of integration
 * @param {string} props.data.status - The current status of the integration
 * @param {string} props.data.id - The integration ID
 * @param {Function} props.refreshIntegrations - Function to refresh integrations
 * @param {string} props.friggBaseUrl - The base URL for the Frigg service
 * @param {string} props.authToken - JWT token for authenticated user in Frigg
 * @param {Function} props.navigateToSampleDataFn - A function to navigate to sample data route, receives integration ID as a parameter
 * @returns {JSX.Element} The rendered component
 * @constructor
 */
function IntegrationHorizontal(props) {
  const {
    authToken,
    refreshIntegrations,
    friggBaseUrl,
    navigateToSampleDataFn,
  } = props;
  const { name, description, icon } = props.data.display;
  const { type, status: initialStatus, id: integrationId } = props.data;

  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [userActions, setUserActions] = useState([]);

  const api = new Api(friggBaseUrl, authToken);

  useEffect(() => {
    if (props.data.id) {
      const loadUserActions = async () => {
        const userActionRes = await api.getUserActions(
          integrationId,
          "QUICK_ACTION"
        );
        const userActions = [];
        Object.keys(userActionRes || {}).map((key) => {
          userActions.push({
            title: userActionRes[key].title,
            description: userActionRes[key].description,
            action: key,
          });
        });
        setUserActions(userActions);
      };
      loadUserActions().catch((error) => {
        console.error(error);
      });
    }
  }, []);

  const getAuthorizeRequirements = async () => {
    setIsProcessing(true);
    const authorizeData = await api.getAuthorizeRequirements(type, "");
    if (authorizeData.type === "oauth2") {
      window.location.href = authorizeData.url;
    }
    if (authorizeData.type !== "oauth2") {
      let data = authorizeData.data;
      for (const element of Object.entries(data.uiSchema)) {
        if (!element["ui:widget"]) {
          element["ui:widget"] = "text";
        }
      }

      openAuthModal();
    }
  };

  function openAuthModal() {
    setIsAuthModalOpen(true);
  }

  function closeAuthModal() {
    setIsAuthModalOpen(false);
    setIsProcessing(false);
  }

  function openConfigModal() {
    setIsConfigModalOpen(true);
  }

  function closeConfigModal() {
    setIsConfigModalOpen(false);
    setIsProcessing(false);
  }

  const disconnectIntegration = async () => {
    await api.deleteIntegration(props.data.id);
    setIsProcessing(true);
    setStatus(false);
    await refreshIntegrations(props);
    setIsProcessing(false);
  };

  return (
    <>
      <div
        className="flex flex-nowrap p-4 bg-white rounded-lg shadow-xs"
        data-testid="integration-horizontal"
      >
        <div className="flex flex-1">
          <img
            className="mr-3 w-[80px] h-[80px] rounded-lg"
            alt={name}
            src={icon}
          />
          <div className="pr-1 overflow-hidden">
            <p className="w-full text-lg font-semibold text-gray-700 truncate ...">
              {name}
            </p>
            <p className="pt-2 text-sm font-medium text-gray-600">
              {description}
            </p>
            {status && status === "NEEDS_CONFIG" && (
              <p className="inline-flex pt-2 text-xs font-medium text-orange-500 gap-1">
                <Settings className="w-4 h-4" /> Configure
              </p>
            )}
          </div>
        </div>
        <div>
          <div className="flex flex-col h-full align-items-end">
            {status ? (
              <>
                <div className="flex-1">
                  <label
                    htmlFor={name}
                    className="flex items-center cursor-pointer"
                  >
                    <Switch name={name} id={name} checked />
                  </label>
                </div>
                <div className="flex flex-row-reverse">
                  <QuickActionsMenu
                    userActions={userActions}
                    integrationConfiguration={openConfigModal}
                    disconnectIntegration={disconnectIntegration}
                    integrationId={integrationId}
                    navigateToSampleDataFn={navigateToSampleDataFn}
                    friggBaseUrl={friggBaseUrl}
                    authToken={authToken}
                  />
                </div>
              </>
            ) : (
              <Button onClick={getAuthorizeRequirements}>
                {isProcessing ? <LoadingSpinner /> : "Connect"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {isAuthModalOpen ? (
        <FormBasedAuthModal
          isAuthModalOpen={isAuthModalOpen}
          closeAuthModal={closeAuthModal}
          refreshIntegrations={refreshIntegrations}
          name={name}
          type={type}
          friggBaseUrl={friggBaseUrl}
          authToken={authToken}
        ></FormBasedAuthModal>
      ) : null}

      {isConfigModalOpen ? (
        <IntegrationConfigurationModal
          isConfigModalOpen={isConfigModalOpen}
          closeConfigModal={closeConfigModal}
          name={name}
          refreshIntegrations={() => refreshIntegrations(props)}
          integrationId={props.data.id}
          friggBaseUrl={friggBaseUrl}
          authToken={authToken}
        ></IntegrationConfigurationModal>
      ) : null}
    </>
  );
}

export default IntegrationHorizontal;
