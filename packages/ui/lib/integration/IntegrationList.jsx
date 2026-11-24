import { useEffect, useState, useCallback } from "react";
import IntegrationSkeleton from "./IntegrationSkeleton";
import { getActiveAndPossibleIntegrationsCombined } from "../utils/IntegrationUtils";
import API from "../api/api";
import { IntegrationHorizontal, IntegrationVertical } from "../integration";

/**
 *
 * @param props.integrationType - Type of integration to filter by
 * @param props.friggBaseUrl - Base URL for Frigg backend
 * @param props.componentLayout - Layout for displaying integrations - either 'default-horizontal' or 'default-vertical'
 * @param props.authToken - JWT token for authenticated user in Frigg
 * @param {Function} props.navigateToSampleDataFn - A function to navigate to sample data route, receives integration ID as a parameter
 * @returns {JSX.Element} The rendered component
 * @constructor
 */
const IntegrationList = (props) => {
  const [installedIntegrations, setInstalledIntegrations] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [isloading, setIsLoading] = useState(true);

  const loadIntegrations = useCallback(async () => {
    const api = new API(props.friggBaseUrl, props.authToken);
    const integrationsData = await api.listIntegrations();

    if (integrationsData.error) {
      console.log(
        "Something went wrong while fetching integrations, please try again later."
      );
    }

    if (integrationsData.integrations) {
      const activeAndPossibleIntegrations =
        getActiveAndPossibleIntegrationsCombined(integrationsData);
      setIntegrations(activeAndPossibleIntegrations);
    }
  }, [props.authToken, props.friggBaseUrl]);

  useEffect(() => {
    if (!props.authToken) {
      console.log("Authentication token is required to fetch integrations.");
      return;
    }

    loadIntegrations().then(() => setIsLoading(false));
  }, [loadIntegrations, props.authToken]);

  const setInstalled = (data) => {
    const items = [data, ...installedIntegrations];
    setInstalledIntegrations(items);
  };

  const integrationComponent = (integration) => {
    if (props.componentLayout === "default-horizontal") {
      return (
        <IntegrationHorizontal
          data={integration}
          key={`combined-integration-${integration.type}`}
          handleInstall={setInstalled}
          refreshIntegrations={loadIntegrations}
          friggBaseUrl={props.friggBaseUrl}
          authToken={props.authToken}
          navigateToSampleDataFn={props.navigateToSampleDataFn}
        />
      );
    }
    if (props.componentLayout === "default-vertical") {
      return (
        <IntegrationVertical
          data={integration}
          key={`combined-integration-${integration.type}`}
          handleInstall={setInstalled}
          refreshIntegrations={loadIntegrations}
          friggBaseUrl={props.friggBaseUrl}
        />
      );
    }
  };

  const renderCombinedIntegrations = (combinedIntegrations) => {
    if (props.integrationType === "Recently added") {
      return combinedIntegrations.map((integration) =>
        integrationComponent(integration)
      );
    }
    if (props.integrationType === "Installed") {
      return installedIntegrations.map((integration) =>
        integrationComponent(integration)
      );
    }
    return combinedIntegrations
      .filter(
        (integration) =>
          integration.display.description === props.integrationType
      )
      .map((integration) => integrationComponent(integration));
  };

  return (
    <>
      {isloading && (
        <div className="grid gap-6 lg:col-span-1 lg:grid-cols-1 xl:col-span-2 xl:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3 grid-auto-rows-[128px]">
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
          <IntegrationSkeleton layout={props.componentLayout} />
        </div>
      )}
      {renderCombinedIntegrations(integrations).length === 0 ? (
        <p>No {props.integrationType} integrations found.</p>
      ) : (
        renderCombinedIntegrations(integrations)
      )}
    </>
  );
};

export default IntegrationList;
