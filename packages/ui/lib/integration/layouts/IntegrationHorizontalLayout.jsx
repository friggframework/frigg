import React from "react";
import { Settings } from "lucide-react";
import { Switch } from "../../components/switch";
import { Button } from "../../components/button.jsx";
import { LoadingSpinner } from "../../components/LoadingSpinner";
import QuickActionsMenu from "../QuickActionsMenu";

/**
 * Horizontal layout for integration cards
 * 
 * @param {Object} props - Component props
 * @param {Object} props.data - Integration data
 * @param {Object} props.integrationState - State and methods from useIntegrationLogic hook
 * @param {Function} props.navigateToSampleDataFn - Function to navigate to sample data
 * @returns {JSX.Element} The rendered horizontal layout
 */
export function IntegrationHorizontalLayout({ data, integrationState, navigateToSampleDataFn }) {
    const { name, description, icon } = data.display || { name: 'Unknown', description: 'No description', icon: null };
    const { friggBaseUrl, authToken } = data;

    const {
        status,
        isProcessing,
        userActions,
        getAuthorizeRequirements,
        disconnectIntegration,
        openConfigModal,
    } = integrationState;

    return (
        <div
            className="flex flex-nowrap p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow min-h-[128px]"
            data-testid="integration-horizontal"
        >
            <div className="flex flex-1 gap-4">
                <img
                    className="w-[80px] h-[80px] rounded-lg object-contain flex-shrink-0"
                    alt={name}
                    src={icon}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"%3E%3Crect fill="%23e5e7eb" width="80" height="80"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%239ca3af" dy=".3em" font-family="sans-serif" font-size="12"%3ENo Icon%3C/text%3E%3C/svg%3E';
                    }}
                />
                <div className="flex-1 overflow-hidden flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-1">
                        <p className="text-lg font-semibold text-gray-800 truncate">
                            {name}
                        </p>
                        {status && status === "ENABLED" && (
                            <span className="inline-flex text-xs font-medium text-green-600 px-2 py-0.5 bg-green-50 rounded-full flex-shrink-0">
                                Installed
                            </span>
                        )}
                        {status === "AVAILABLE" && (
                            <span className="inline-flex text-xs font-medium text-gray-500 px-2 py-0.5 bg-gray-50 rounded-full flex-shrink-0">
                                Available
                            </span>
                        )}
                        {status && status === "NEEDS_CONFIG" && (
                            <span className="inline-flex text-xs font-medium text-orange-600 px-2 py-0.5 bg-orange-50 rounded-full items-center gap-1 flex-shrink-0">
                                <Settings className="w-3 h-3" /> Configure
                            </span>
                        )}
                    </div>
                    <p className="text-sm font-normal text-gray-600 line-clamp-2">
                        {description}
                    </p>
                </div>
            </div>
            <div className="flex items-center ml-4">
                {(status === "ENABLED" || status === "NEEDS_CONFIG") ? (
                    <div className="flex flex-col gap-2">
                        <Button
                            onClick={disconnectIntegration}
                            className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-lg hover:bg-red-50 hover:border-red-400 transition-colors"
                        >
                            {isProcessing ? <LoadingSpinner /> : "Disconnect"}
                        </Button>
                        {userActions && userActions.length > 0 && (
                            <QuickActionsMenu
                                userActions={userActions}
                                integrationConfiguration={openConfigModal}
                                disconnectIntegration={disconnectIntegration}
                                integrationId={data.id}
                                navigateToSampleDataFn={navigateToSampleDataFn}
                                friggBaseUrl={friggBaseUrl}
                                authToken={authToken}
                            />
                        )}
                    </div>
                ) : (
                    <Button
                        onClick={getAuthorizeRequirements}
                        className="px-6 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                    >
                        {isProcessing ? <LoadingSpinner /> : "Install"}
                    </Button>
                )}
            </div>
        </div>
    );
}
