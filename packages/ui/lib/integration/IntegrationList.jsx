import { useEffect, useMemo } from "react";
import IntegrationSkeleton from "./IntegrationSkeleton";
import { useIntegrationData } from "./context/IntegrationDataContext";
import { IntegrationHorizontal, IntegrationVertical } from "../integration";

/**
 *
 * @param props.integrationType - Type of integration to filter by
 * @param props.componentLayout - Layout for displaying integrations - either 'default-horizontal' or 'default-vertical'
 * @param {Function} props.navigateToSampleDataFn - A function to navigate to sample data route, receives integration ID as a parameter
 * @returns {JSX.Element} The rendered component
 * @constructor
 */
const IntegrationList = (props) => {
  const {
    integrationOptions,
    installedIntegrations,
    loading,
    loadData
  } = useIntegrationData();

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Combine installed and available integrations for display
  const displayIntegrations = useMemo(() => {
    // For installed filter, show only installed
    if (props.integrationType === "Installed") {
      return installedIntegrations;
    }

    // Combine available options with installed integrations
    // Show installed if exists, otherwise show option
    const combined = [];
    const installedTypes = new Set(installedIntegrations.map(i => i.type));

    // Add all integration options
    integrationOptions.forEach(option => {
      const installed = installedIntegrations.find(i => i.type === option.type);
      combined.push(installed || option);
    });

    // Filter by type if specified
    if (props.integrationType && props.integrationType !== "Recently added") {
      return combined.filter(
        integration => integration.display?.category === props.integrationType
      );
    }

    return combined;
  }, [installedIntegrations, integrationOptions, props.integrationType]);

  const integrationComponent = (integration) => {
    const Component = props.componentLayout === "default-horizontal"
      ? IntegrationHorizontal
      : IntegrationVertical;

    return (
      <Component
        data={integration}
        key={`integration-${integration.type || integration.id}`}
        navigateToSampleDataFn={props.navigateToSampleDataFn}
      />
    );
  };

  return (
    <>
      {loading && (
        <div className="grid gap-6 lg:col-span-1 lg:grid-cols-1 xl:col-span-2 xl:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3 grid-auto-rows-[128px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <IntegrationSkeleton key={i} layout={props.componentLayout} />
          ))}
        </div>
      )}
      {!loading && displayIntegrations.length === 0 ? (
        <p>No {props.integrationType} integrations found.</p>
      ) : (
        displayIntegrations.map(integrationComponent)
      )}
    </>
  );
};

export default IntegrationList;
