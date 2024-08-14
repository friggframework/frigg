import React, { useEffect } from "react";
import qString from "query-string";
import API from "../api/api";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";

/**
 * @param {string} props.app - The name of the app being authorized
 * @param {string} props.friggBaseUrl - The base URL for the Frigg service
 * @param {string} props.authToken - JWT token for authenticated user in Frigg
 * @param {string} props.primaryEntityName - The name of the primary entity in the app
 * @param {function} props.redirectToUrl - A function to navigate when authorization is successful
 * @returns {JSX.Element} The rendered component
 * @constructor
 */
const RedirectFromAuth = (props) => {
  useEffect(() => {
    const handleAuth = async () => {
      const api = new API(props.friggBaseUrl, props.authToken);
      const params = qString.parse(window.location.search);

      if (params.code) {
        const targetEntity = await api.authorize(props.app, {
          code: params.code,
        });
        const integrations = await api.listIntegrations();

        if (targetEntity?.error) {
          alert(targetEntity.error);
          props.redirectToUrl();
          return;
        }

        const config = {
          type: props.app,
          category: "CRM",
        };

        const primaryEntity = integrations.entities.authorized.find(
          (entity) => entity.type === props.primaryEntityName
        );

        const integration = await api.createIntegration(
          primaryEntity.id ?? targetEntity.entity_id,
          targetEntity.entity_id,
          config
        );

        if (integration.error) {
          alert(integration.error);
          return;
        }

        props.redirectToUrl();
      }
    };

    handleAuth();
  }, []);

  return (
    <div className="flex items-center justify-center h-screen w-screen">
      <LoadingSpinner />
    </div>
  );
};

export default RedirectFromAuth;
