import React from 'react';
import { Check, Download, Info, RefreshCw, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '../../components/button';

const IntegrationCard = ({
  integration,
  isInstalled,
  isInstalling,
  onInstall,
  onUninstall,
  onUpdate,
  onViewDetails
}) => {
  const { displayName, description, version, category, logoUrl, isOfficial } = integration;

  return (
    <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${displayName} logo`}
              className="w-10 h-10 object-contain"
            />
          ) : (
            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
              <span className="text-gray-500 text-xs font-bold">
                {displayName.charAt(0)}
              </span>
            </div>
          )}
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              {displayName}
              {isOfficial && (
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  Official
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500">{category}</p>
          </div>
        </div>
        {isInstalled && (
          <Check className="h-5 w-5 text-green-500" />
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 mb-3 line-clamp-2">
        {description || 'No description available'}
      </p>

      {/* Version */}
      <div className="text-xs text-gray-500 mb-3">
        Version: {version}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {!isInstalled ? (
          <Button
            size="sm"
            onClick={onInstall}
            disabled={isInstalling}
            className="flex-1"
          >
            {isInstalling ? (
              <>
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                Installing...
              </>
            ) : (
              <>
                <Download className="h-3 w-3 mr-1" />
                Install
              </>
            )}
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={onUpdate}
              className="flex-1"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Update
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={onUninstall}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onViewDetails}
        >
          <Info className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

export default IntegrationCard;