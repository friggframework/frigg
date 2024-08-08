import React, { useCallback, useEffect, useRef, useState } from "react";
import IntegrationSkeleton from "./IntegrationSkeleton";
import IntegrationUtils from "../utils/IntegrationUtils";
import API from "../api/api";
import { IntegrationHorizontal, IntegrationVertical } from "../integration";

/**
 *
 * @param props.integrationType - Type of integration to filter by
 * @param props.friggBaseUrl - Base URL for Frigg backend
 * @param props.componentLayout - Layout for displaying integrations - either 'default-horizontal' or 'default-vertical'
 * @param props.authToken - JWT token for authenticated user in Frigg
 * @returns {Element}
 * @constructor
 */
const IntegrationList = (props) => {
  const [installedIntegrations, setInstalledIntegrations] = useState([]);
  const [integrations, setIntegrations] = useState({});
  const integrationUtils = useRef(null);

  const refreshIntegrations = useCallback(async () => {
    const api = new API(props.friggBaseUrl, props.authToken);
    const integrationsData = await api.listIntegrations();

    if (integrationsData.error) {
      // dispatch(logoutUser());
      //todo: if integration has an error, we should display an error message + a way to solve it
    }

    setIntegrations(integrationsData);
    if (integrationsData.integrations) {
      integrationUtils.current = new IntegrationUtils(integrationsData);
    }
  }, [props.authToken, props.friggBaseUrl]);

  useEffect(() => {
    const init = async () => {
      if (props.authToken) {
        await refreshIntegrations();
      }
    };

    init();
  }, [props.authToken, refreshIntegrations]);

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
          refreshIntegrations={refreshIntegrations}
          friggBaseUrl={props.friggBaseUrl}
          authToken={props.authToken}
        />
      );
    }
    if (props.componentLayout === "default-vertical") {
      return (
        <IntegrationVertical
          data={integration}
          key={`combined-integration-${integration.type}`}
          handleInstall={setInstalled}
          refreshIntegrations={refreshIntegrations}
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
      {integrationUtils.current === null ? (
        <div className="grid gap-6 lg:col-span-1 lg:grid-cols-1 xl:col-span-2 xl:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3">
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
      ) : (
        renderCombinedIntegrations(
          integrationUtils.current.getActiveAndPossibleIntegrationsCombined()
        )
      )}
      {integrationUtils.current !== null &&
        renderCombinedIntegrations(
          integrationUtils.current.getActiveAndPossibleIntegrationsCombined()
        ).length === 0 && <p>No {props.integrationType} integrations found.</p>}
    </>
  );
};

export default IntegrationList;
