import React, { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import Api from "./../api/api";
import QuickActionsMenu from "./QuickActionsMenu";
import { FormBasedAuthModal, IntegrationConfigurationModal } from "./modals";
import { Switch } from "../components/switch";
import { Button } from "../components/button";
import { LoadingSpinner } from "../components/LoadingSpinner";

/**
 *
 * @param props.data.display.name {string}
 * @param props.data.display.description {string}
 * @param props.data.display.icon {string}
 * @param props.data.type {string}
 * @param props.data.status {string}
 * @param props.refreshIntegrations {Function}
 * @param props.friggBaseUrl {string}
 * @returns {JSX.Element}
 * @constructor
 */
function IntegrationHorizontal(props) {
  const { name, description, icon } = props.data.display;
  const { type, status: initialStatus, id: integrationId } = props.data;
  const refreshIntegrations = props.refreshIntegrations;

  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [userActions, setUserActions] = useState([]);

  const api = new Api(props.friggBaseUrl);

  useEffect(() => {
    const userActions = [
      {
        title: "Get Sample Data",
        action: "SAMPLE_DATA",
      },
    ];
    Object.keys(props.data.userActions || {}).map((key) => {
      userActions.push({
        title: props.data.userActions[key].title,
        description: props.data.userActions[key].description,
        action: key,
      });
    });
    setUserActions(userActions);
  }, []);

  const getAuthorizeRequirements = async () => {
    setIsProcessing(true);
    api.setJwt(sessionStorage.getItem("jwt")); // todo: should this be passed in as prop?
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
    const jwt = sessionStorage.getItem("jwt"); // todo: should this be passed in as prop?
    api.setJwt(jwt);
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
        ></FormBasedAuthModal>
      ) : null}

      {isConfigModalOpen ? (
        <IntegrationConfigurationModal
          isConfigModalOpen={isConfigModalOpen}
          closeConfigModal={closeConfigModal}
          name={name}
          refreshIntegrations={() => refreshIntegrations(props)}
          integrationId={props.data.id}
          friggBaseUrl={props.friggBaseUrl}
        ></IntegrationConfigurationModal>
      ) : null}
    </>
  );
}

export default IntegrationHorizontal;
