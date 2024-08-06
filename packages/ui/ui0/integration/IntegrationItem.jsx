import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import Api from "../../api/api";
import ToggleSwitch from "./ToggleSwitch.jsx";
import ModalFormBasedAuth from "./ModalFormBasedAuth.jsx";
import ModalConfig from "./ModalConfig.jsx";
import { showModalForm } from "../../actions/modalForm";
import { setIntegrations } from "../../actions/integrations";
import { CircleAlert } from "lucide-react";
import IntegrationDropdown from "./IntegrationDropdown";
import { Button } from "../ui2/button";

const authorizeType = "oauth2";
const statuses = {
  enabled: "ENABLED",
  needs_config: "NEEDS_CONFIG",
};
const layouts = {
  horizontal: "horizontal",
  vertical: "vertical",
  row: "row",
};

function IntegrationItem({
  data,
  handleInstall,
  refreshIntegrations,
  layout = "horizontal",
  ...props
}) {
  const navigate = useNavigate();
  const { name, description, icon } = data.display;
  const { type, hasUserConfig, status: initialStatus } = data;
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [verticalStatus, setVerticalStatus] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(true);

  const api = new Api();
  const authToken = useSelector((state) => state.auth.token);
  api.setJwt(authToken);

  const getAuthorizeRequirements = async () => {
    setIsProcessing(true);
    api.setJwt(sessionStorage.getItem("jwt"));
    const authorizeData = await api.getAuthorizeRequirements(type, "");
    if (authorizeData.type === authorizeType) {
      window.location.href = authorizeData.url;
    }
    if (authorizeData.type !== authorizeType) {
      let data = authorizeData.data;
      for (const element of Object.entries(data.uiSchema)) {
        if (!element["ui:widget"]) {
          element["ui:widget"] = "text";
        }
      }
      setIsAuthModalOpen(true);
    }
  };

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

  const getSampleData = async () => {
    navigate(`/data/${data.id}`);
  };

  const disconnectIntegration = async () => {
    const jwt = sessionStorage.getItem("jwt");
    api.setJwt(jwt);
    await api.deleteIntegration(data.id);
    setIsProcessing(true);
    setStatus(false);
    await refreshIntegrations(props);
    setIsProcessing(false);
  };

  const getVerticalAuthorizeRequirements = async () => {
    setIsProcessing(true);
    const authorizeData = await api.getAuthorizeRequirements(type, "");
    if (authorizeData.type === authorizeType) {
      window.location.href = authorizeData.url;
    }
    if (authorizeData.type !== authorizeType) enableModalForm();
  };

  const enableModalForm = () => {
    const requestType = getRequestType();
    props.dispatch(
      showModalForm(true, data.id, requestType, data.type, data.config),
    );
  };

  const getRequestType = () => {
    let type;
    switch (data.status) {
      case "NEEDS_CONFIG":
        type = "INITIAL";
        break;
      case "ENABLED":
        type = "CONFIGURE";
        break;
      default:
        type = "AUTHORIZE";
    }
    return type;
  };

  const disconnectVerticalIntegration = async () => {
    await api.deleteIntegration(data.id);
    const integrations = await api.listIntegrations();
    if (!integrations.error) {
      props.dispatch(setIntegrations(integrations));
    }
    setVerticalStatus("");
  };

  const HorizontalLayout = () => (
    <>
      <img
        className="mr-3 w-[80px] h-[80px] rounded-lg"
        alt={name}
        src={icon}
      />
      <div className="pr-1 overflow-hidden">
        <p className="w-full text-lg font-semibold text-gray-700 truncate ...">
          {name}
        </p>
        <p className="pt-2 text-sm font-medium text-gray-600">{description}</p>
        {status && status === statuses.needs_config && (
          <p className="inline-flex pt-2 text-xs font-medium text-red-300">
            <CircleAlert className="w-4 h-4 mr-1" /> Configure
          </p>
        )}
      </div>
      <div className="ml-auto">
        <div className="relative">
          {status && (
            <ToggleSwitch
              name={name}
              status={status}
              customDotsStyle="mt-4 ml-auto"
              getSampleData={getSampleData}
              openConfigModal={openConfigModal}
              disconnectIntegration={disconnectIntegration}
            />
          )}
          {!status && (
            <Button
              onClick={getAuthorizeRequirements}
              className="px-3 py-2 text-xs font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
            >
              {isProcessing ? (
                <svg
                  className="animate-spin h-5 w-5 text-white"
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
              ) : (
                "Connect"
              )}
            </Button>
          )}
        </div>
      </div>
    </>
  );

  const VerticalLayout = () => (
    <>
      <div className="flex w-full h-[24px]">
        <div className="inline-flex relative mr-auto">
          {verticalStatus && verticalStatus === statuses.needs_config && (
            <p className="inline-flex text-xs font-medium text-red-300 text-center">
              <CircleAlert className="w-4 h-4 mr-1" /> Configure
            </p>
          )}
        </div>
        <div className="inline-flex relative justify-end ml-auto">
          {(verticalStatus && verticalStatus === statuses.enabled) ||
            (verticalStatus === statuses.needs_config && (
              <IntegrationDropdown
                getSampleData={getSampleData}
                disconnectVerticalIntegration={disconnectVerticalIntegration}
                name={name}
                hasUserConfig={hasUserConfig}
              />
            ))}
        </div>
      </div>
      <img className="w-[120px] h-[120px] rounded-full" alt={name} src={icon} />
      <div className="pr-1 pt-4 pb-4 overflow-hidden">
        <p className="w-full text-2xl font-semibold text-gray-700 text-center truncate ...">
          {name}
        </p>
        <p className="w-full pt-2 text-md font-medium text-gray-600 text-center">
          {description}
        </p>
      </div>
      <div className="items-center pb-3">
        <div className="relative">
          {(verticalStatus && verticalStatus === statuses.enabled) ||
            (status === statuses.needs_config && (
              <button
                onClick={disconnectVerticalIntegration}
                className="w-full px-5 py-3 font-medium leading-5 text-center text-purple-600 transition-colors duration-150 rounded-lg border-2 border-purple-400 hover:border-purple-600 hover:bg-purple-600 hover:text-white focus:outline-none focus:shadow-outline-purple"
              >
                Disconnect
              </button>
            ))}
          {!verticalStatus && (
            <button
              onClick={getVerticalAuthorizeRequirements}
              className="w-full px-5 py-3 font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
            >
              {isProcessing ? (
                <svg
                  className="animate-spin h-5 w-5 text-white"
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
              ) : (
                "Connect"
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );

  const RowLayout = () => (
    <>
      <img
        className="mr-3 w-[80px] h-[80px] rounded-lg"
        alt={name}
        src={icon}
      />
      <div className="pr-1 overflow-hidden">
        <p className="w-full text-lg font-semibold text-gray-700 truncate ...">
          {name}
        </p>
        <p className="pt-2 text-sm font-medium text-gray-600">{description}</p>
      </div>
      <div className="ml-auto flex align-items-center">
        {status && status === statuses.needs_config && (
          <p className="inline-flex mr-4 text-xs font-medium text-red-300">
            <CircleAlert className="w-4 h-4 mr-1" /> Configure
          </p>
        )}
        {status && (
          <ToggleSwitch
            name={name}
            status={status}
            customDotsStyle="mt-0 ml-2"
            getSampleData={getSampleData}
            openConfigModal={openConfigModal}
            disconnectIntegration={disconnectIntegration}
          />
        )}
        {!status && (
          <button
            onClick={getAuthorizeRequirements}
            className="px-3 py-2 text-xs font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg active:bg-purple-600 hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple"
          >
            {isProcessing ? (
              <svg
                className="animate-spin h-5 w-5 text-white"
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
            ) : (
              "Connect"
            )}
          </button>
        )}
      </div>
    </>
  );

  const containerStyle = {
    horizontal: "flex-nowrap",
    vertical: "flex-col items-center",
    row: "align-items-center",
  };

  const contentLayout = {
    horizontal: <HorizontalLayout />,
    vertical: <VerticalLayout />,
    row: <RowLayout />,
  };

  return (
    <>
      <div
        className={`${"flex p-4 bg-white rounded-lg shadow-xs"} ${
          containerStyle[layout]
        }`}
        data-testid={
          layout === layouts.horizontal
            ? "integration-horizontal"
            : layout === layouts.vertical
              ? "integration-vertical"
              : layout === layouts.row
                ? "integration-row"
                : ""
        }
      >
        {contentLayout[layout]}

        {isAuthModalOpen ? (
          <ModalFormBasedAuth
            name={name}
            type={type}
            closeAuthModal={closeAuthModal}
            isAuthModalOpen={isAuthModalOpen}
            refreshIntegrations={refreshIntegrations}
          />
        ) : null}

        {isConfigModalOpen && (
          <ModalConfig
            name={name}
            type={type}
            closeConfigModal={closeConfigModal}
          />
        )}
      </div>
    </>
  );
}

export default IntegrationItem;
