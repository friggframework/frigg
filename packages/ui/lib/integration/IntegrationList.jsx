import { useEffect, useMemo, useState } from "react";
import IntegrationSkeleton from "./IntegrationSkeleton";
import { useIntegrationData } from "./context/IntegrationDataContext";
import { IntegrationHorizontal, IntegrationVertical } from "../integration";

/**
 * IntegrationList with Search and Filter
 * @param props.integrationType - Type of integration to filter by
 * @param props.componentLayout - Layout for displaying integrations - either 'default-horizontal' or 'default-vertical'
 * @param props.showSearch - Show search input (default: true)
 * @param props.showCategoryFilter - Show category filter (default: true)
 * @param {Function} props.navigateToSampleDataFn - A function to navigate to sample data route, receives integration ID as a parameter
 * @returns {JSX.Element} The rendered component
 * @constructor
 */
const IntegrationList = (props) => {
  const {
    showSearch = true,
    showCategoryFilter = true,
    componentLayout = "default-vertical",
    redirectContext
  } = props;

  const {
    filteredIntegrationOptions,
    installedIntegrations,
    loading,
    loadData,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    categories,
    baseUrl,
    authToken
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

    // Use filtered options from context
    const combined = [];

    // Add all filtered integration options
    filteredIntegrationOptions.forEach(option => {
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
  }, [installedIntegrations, filteredIntegrationOptions, props.integrationType]);

  const integrationComponent = (integration) => {
    const Component = componentLayout === "default-horizontal"
      ? IntegrationHorizontal
      : IntegrationVertical;

    const isInstalled = !!integration.id; // Has ID means it's installed

    return (
      <Component
        data={integration}
        key={`integration-${integration.type || integration.id}`}
        navigateToSampleDataFn={props.navigateToSampleDataFn}
        onInstallClick={isInstalled ? undefined : props.onInstallClick}
      />
    );
  };

  return (
    <div className="integration-list-container">
      {/* Search and Filter Controls */}
      {(showSearch || showCategoryFilter) && (
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          {/* Search Input */}
          {showSearch && (
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search integrations by name, type, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Category Filter */}
          {showCategoryFilter && categories.length > 0 && (
            <div className="sm:w-64">
              <select
                value={selectedCategory || ''}
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Clear Filters */}
          {(searchQuery || selectedCategory) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 whitespace-nowrap"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Results Count */}
      {!loading && displayIntegrations.length > 0 && (searchQuery || selectedCategory) && (
        <div className="mb-4 text-sm text-gray-600">
          Showing {displayIntegrations.length} integration{displayIntegrations.length !== 1 ? 's' : ''}
          {searchQuery && ` matching "${searchQuery}"`}
          {selectedCategory && ` in ${selectedCategory}`}
        </div>
      )}

      {/* Integration Grid */}
      {loading && (
        <div className="grid gap-6 lg:col-span-1 lg:grid-cols-1 xl:col-span-2 xl:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3 grid-auto-rows-[128px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <IntegrationSkeleton key={i} layout={componentLayout} />
          ))}
        </div>
      )}

      {!loading && displayIntegrations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">
            {searchQuery || selectedCategory
              ? 'No integrations found matching your filters.'
              : `No ${props.integrationType || ''} integrations found.`}
          </p>
          {(searchQuery || selectedCategory) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
              className="mt-4 text-blue-600 hover:text-blue-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:col-span-1 lg:grid-cols-1 xl:col-span-2 xl:grid-cols-2 2xl:col-span-3 2xl:grid-cols-3 grid-auto-rows-[128px]">
          {displayIntegrations.map(integrationComponent)}
        </div>
      )}
    </div>
  );
};

export default IntegrationList;
