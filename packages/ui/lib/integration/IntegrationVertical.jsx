import React, { useState } from "react";
import { CircleAlert } from "lucide-react";
import Api from "./../api/api";
import IntegrationDropdown from "./IntegrationDropdown";
import { Button } from "../components/button.jsx";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";

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
function IntegrationVertical(props) {
  const { name, description, category, icon } = props.data.display;
  const { hasUserConfig, type } = props.data;

  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState("");
  const [installed, setInstalled] = useState([]);

  const api = new Api(props.friggBaseUrl);
  api.setJwt(sessionStorage.getItem("jwt")); //todo: should this be passed in as prop?

  const getAuthorizeRequirements = async () => {
    setIsProcessing(true);
    const authorizeData = await api.getAuthorizeRequirements(type, "");
    if (authorizeData.type === "oauth2") {
      window.location.href = authorizeData.url;
    }
    if (authorizeData.type !== "oauth2") enableModalForm();
  };

  const enableModalForm = () => {
    const requestType = getRequestType();
  };

  const getRequestType = () => {
    let type;
    switch (props.data.status) {
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

  const getSampleData = async () => {
    alert("Implement sample data fetching logic here");
  };

  const disconnectIntegration = async () => {
    await api.deleteIntegration(props.data.id);
    const integrations = await api.listIntegrations();
    if (!integrations.error) {
      alert("Integration disconnected successfully");
    }
    setInstalled([]);
    setStatus("");
  };

  return (
    <>
      <div
        className="flex flex-col items-center p-4 bg-white rounded-lg shadow-xs"
        data-testid="integration-vertical"
      >
        <div className="flex w-full h-[24px]">
          <div className="inline-flex relative mr-auto">
            {status && status === "NEEDS_CONFIG" && (
              <p className="inline-flex text-xs font-medium text-red-300 text-center">
                <CircleAlert className="w-4 h-4 mr-1" /> Configure
              </p>
            )}
          </div>
          <div className="inline-flex relative justify-end ml-auto">
            {(status && status === "ENABLED") ||
              (status === "NEEDS_CONFIG" && (
                <IntegrationDropdown
                  getSampleData={getSampleData}
                  disconnectIntegration={disconnectIntegration}
                  name={name}
                  hasUserConfig={hasUserConfig}
                />
              ))}
          </div>
        </div>
        <img
          className="w-[120px] h-[120px] rounded-full"
          alt={name}
          src={icon}
        />
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
            {(status && status === "ENABLED") ||
              (status === "NEEDS_CONFIG" && (
                <button
                  onClick={disconnectIntegration}
                  className="w-full px-5 py-3 font-medium leading-5 text-center text-primary transition-colors duration-150 rounded-lg border-2 border-purple-400 hover:border-purple-600 hover:bg-purple-600 hover:text-white focus:outline-none focus:shadow-outline-purple"
                >
                  Disconnect
                </button>
              ))}
            {!status && (
              <Button onClick={getAuthorizeRequirements}>
                {isProcessing ? <LoadingSpinner /> : "Connect"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default IntegrationVertical;
