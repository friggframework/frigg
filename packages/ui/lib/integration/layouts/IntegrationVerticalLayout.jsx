import React from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "../../components/button.jsx";
import { LoadingSpinner } from "../../components/LoadingSpinner.jsx";
import IntegrationDropdown from "../IntegrationDropdown";

/**
 * Vertical layout for integration cards
 * 
 * @param {Object} props - Component props
 * @param {Object} props.data - Integration data
 * @param {Object} props.integrationState - State and methods from useIntegrationLogic hook
 * @returns {JSX.Element} The rendered vertical layout
 */
export function IntegrationVerticalLayout({ data, integrationState }) {
    const { name, description, icon } = data.display || { name: 'Unknown', description: 'No description', icon: null };
    const { hasUserConfig } = data;

    const {
        status,
        isProcessing,
        getAuthorizeRequirements,
        disconnectIntegration,
        getSampleData,
    } = integrationState;

    return (
        <div
            className="flex flex-col items-center p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow"
            data-testid="integration-vertical"
        >
            <div className="flex w-full h-[24px] mb-4">
                <div className="inline-flex relative mr-auto">
                    {status && status === "NEEDS_CONFIG" && (
                        <p className="inline-flex text-xs font-medium text-red-500 text-center">
                            <CircleAlert className="w-4 h-4 mr-1" /> Configure
                        </p>
                    )}
                    {status && status === "ENABLED" && (
                        <span className="inline-flex text-xs font-medium text-green-600 px-2 py-1 bg-green-50 rounded-full">
                            Installed
                        </span>
                    )}
                    {status === "AVAILABLE" && (
                        <span className="inline-flex text-xs font-medium text-gray-500 px-2 py-1 bg-gray-50 rounded-full">
                            Available
                        </span>
                    )}
                </div>
                <div className="inline-flex relative justify-end ml-auto">
                    {(status === "ENABLED" || status === "NEEDS_CONFIG") && (
                        <IntegrationDropdown
                            getSampleData={getSampleData}
                            disconnectIntegration={disconnectIntegration}
                            name={name}
                            hasUserConfig={hasUserConfig}
                        />
                    )}
                </div>
            </div>
            <img
                className="w-[120px] h-[120px] rounded-lg object-contain mb-4"
                alt={name}
                src={icon}
                onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120"%3E%3Crect fill="%23e5e7eb" width="120" height="120"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%239ca3af" dy=".3em" font-family="sans-serif" font-size="14"%3ENo Icon%3C/text%3E%3C/svg%3E';
                }}
            />
            <div className="pr-1 pb-4 overflow-hidden w-full">
                <p className="w-full text-xl font-semibold text-gray-800 text-center truncate">
                    {name}
                </p>
                <p className="w-full pt-2 text-sm font-normal text-gray-600 text-center line-clamp-2 min-h-[40px]">
                    {description}
                </p>
            </div>
            <div className="w-full mt-auto">
                {(status === "ENABLED" || status === "NEEDS_CONFIG") && (
                    <button
                        onClick={disconnectIntegration}
                        className="w-full px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    >
                        {isProcessing ? <LoadingSpinner /> : "Disconnect"}
                    </button>
                )}
                {(!status || status === "AVAILABLE") && (
                    <Button
                        onClick={getAuthorizeRequirements}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                    >
                        {isProcessing ? <LoadingSpinner /> : "Install"}
                    </Button>
                )}
            </div>
        </div>
    );
}
