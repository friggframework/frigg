import React, { useEffect } from "react";
import qString from "query-string";
import API from "../api/api";
import { LoadingSpinner } from "../components/LoadingSpinner.jsx";

/**
 * @param {string} props.app - The name of the app being authorized
 * @param {string} props.friggBaseUrl - The base URL for the Frigg service
 * @param {string} props.authToken - JWT token for authenticated user in Frigg
 * @param {string} props.primaryEntityName - The name of the primary entity in the app
 * @returns {JSX.Element} The rendered component
 * @constructor
 */
const RedirectFromAuth = (props) => {
  useEffect(() => {
    const handleAuth = async () => {
      const api = new API(props.friggBaseUrl, props.authToken);
      const params = qString.parse(window.location.search);

      if (params.code) {
        const integrations = await api.listIntegrations();
        const targetEntity = await api.authorize(props.app, {
          code: params.code,
        });

        if (targetEntity?.error) {
          alert(targetEntity.error);
          window.location.href = "/integrations";
          return;
        }

        const config = {
          type: props.app,
          category: "CRM",
        };

        const primaryEntity = integrations.entities.authorized.find(
          (entity) => entity.type === props.primaryEntityName
        );

        //todo: shouldn't the integration be created only if primary and target entities exist and are different?
        //todo2: move the createIntegration function to the integrationList component
        const integration = await api.createIntegration(
          primaryEntity.id ?? targetEntity.entity_id,
          targetEntity.entity_id,
          config
        );

        if (integration.error) {
          alert(integration.error);
          return;
        }

        window.location.href = "/integrations";
      }
    };

    handleAuth();
  }, [props.app]);

  return (
    <div className="container">
      <div id="card-wrap" className="card">
        <div className="card-body">
          <LoadingSpinner />
        </div>
      </div>
    </div>
  );
};

export default RedirectFromAuth;
