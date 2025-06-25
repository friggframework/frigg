import React, { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Download, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { Input } from '../../components/input';
import { Button } from '../../components/button';
import { useToast } from '../../components/use-toast';
import IntegrationCard from './IntegrationCard';
import CategoryFilter from './CategoryFilter';
import IntegrationDetailModal from './IntegrationDetailModal';
import LoadingSpinner from '../../components/LoadingSpinner';

const IntegrationBrowser = ({ api }) => {
  const [integrations, setIntegrations] = useState({
    all: [],
    byCategory: {},
    total: 0
  });
  const [installedIntegrations, setInstalledIntegrations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedIntegration, setSelectedIntegration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState({});
  const { toast } = useToast();

  // Load categories and integrations on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      
      // Load categories
      const categoriesResponse = await api.getIntegrationCategories();
      if (categoriesResponse.success) {
        setCategories(categoriesResponse.data);
      }

      // Load all integrations
      const integrationsResponse = await api.getAllIntegrations();
      if (integrationsResponse.success) {
        setIntegrations(integrationsResponse.data);
      }

      // Load installed integrations
      const installedResponse = await api.getInstalledIntegrations();
      if (installedResponse.success) {
        setInstalledIntegrations(installedResponse.data);
      }
    } catch (error) {
      console.error('Failed to load integrations:', error);
      toast({
        title: 'Error',
        description: 'Failed to load integrations. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Search integrations
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      // If search is empty, reload all integrations
      await loadInitialData();
      return;
    }

    try {
      setLoading(true);
      const response = await api.searchIntegrations(searchQuery);
      
      if (response.success) {
        // Update integrations with search results
        setIntegrations({
          all: response.data.integrations,
          byCategory: categorizeIntegrations(response.data.integrations),
          total: response.data.total
        });
      }
    } catch (error) {
      console.error('Search failed:', error);
      toast({
        title: 'Search Error',
        description: 'Failed to search integrations. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, api, toast]);

  // Categorize integrations
  const categorizeIntegrations = (integrationsList) => {
    const categorized = {};
    
    integrationsList.forEach(integration => {
      const category = integration.category || 'Other';
      if (!categorized[category]) {
        categorized[category] = [];
      }
      categorized[category].push(integration);
    });

    return categorized;
  };

  // Install integration
  const handleInstall = async (packageName) => {
    setInstalling(prev => ({ ...prev, [packageName]: true }));

    try {
      const response = await api.installIntegration(packageName);
      
      if (response.success) {
        toast({
          title: 'Success',
          description: `${packageName} installed successfully!`
        });
        
        // Refresh installed integrations list
        const installedResponse = await api.getInstalledIntegrations();
        if (installedResponse.success) {
          setInstalledIntegrations(installedResponse.data);
        }
      }
    } catch (error) {
      console.error('Installation failed:', error);
      toast({
        title: 'Installation Failed',
        description: error.message || 'Failed to install integration',
        variant: 'destructive'
      });
    } finally {
      setInstalling(prev => ({ ...prev, [packageName]: false }));
    }
  };

  // Uninstall integration
  const handleUninstall = async (packageName) => {
    if (!confirm(`Are you sure you want to uninstall ${packageName}?`)) {
      return;
    }

    try {
      const response = await api.uninstallIntegration(packageName);
      
      if (response.success) {
        toast({
          title: 'Success',
          description: `${packageName} uninstalled successfully!`
        });
        
        // Refresh installed integrations list
        const installedResponse = await api.getInstalledIntegrations();
        if (installedResponse.success) {
          setInstalledIntegrations(installedResponse.data);
        }
      }
    } catch (error) {
      console.error('Uninstallation failed:', error);
      toast({
        title: 'Uninstallation Failed',
        description: error.message || 'Failed to uninstall integration',
        variant: 'destructive'
      });
    }
  };

  // Update integration
  const handleUpdate = async (packageName) => {
    try {
      const response = await api.updateIntegration(packageName);
      
      if (response.success) {
        if (response.data.updated) {
          toast({
            title: 'Success',
            description: `${packageName} updated to version ${response.data.currentVersion}!`
          });
        } else {
          toast({
            title: 'No Updates',
            description: `${packageName} is already up to date.`
          });
        }
        
        // Refresh installed integrations list
        const installedResponse = await api.getInstalledIntegrations();
        if (installedResponse.success) {
          setInstalledIntegrations(installedResponse.data);
        }
      }
    } catch (error) {
      console.error('Update failed:', error);
      toast({
        title: 'Update Failed',
        description: error.message || 'Failed to update integration',
        variant: 'destructive'
      });
    }
  };

  // Get filtered integrations
  const getFilteredIntegrations = () => {
    if (selectedCategory === 'all') {
      return integrations.all;
    }
    
    if (selectedCategory === 'installed') {
      // Show only installed integrations
      return integrations.all.filter(integration =>
        installedIntegrations.some(installed => installed.name === integration.name)
      );
    }

    return integrations.byCategory[selectedCategory] || [];
  };

  // Check if integration is installed
  const isInstalled = (packageName) => {
    return installedIntegrations.some(installed => installed.name === packageName);
  };

  const filteredIntegrations = getFilteredIntegrations();

  if (loading && integrations.all.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="integration-browser">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Integration Browser</h2>
        <p className="text-gray-600">
          Discover and install integrations from the Frigg ecosystem
        </p>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="text"
              placeholder="Search integrations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full"
              icon={<Search className="h-4 w-4 text-gray-400" />}
            />
          </div>
          <Button onClick={handleSearch} disabled={loading}>
            Search
          </Button>
          <Button onClick={loadInitialData} variant="outline" disabled={loading}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <CategoryFilter
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          integrationCounts={integrations.byCategory}
          installedCount={installedIntegrations.length}
        />
      </div>

      {/* Results count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredIntegrations.length} integrations
        {selectedCategory !== 'all' && ` in ${selectedCategory}`}
      </div>

      {/* Integration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredIntegrations.map(integration => (
          <IntegrationCard
            key={integration.name}
            integration={integration}
            isInstalled={isInstalled(integration.name)}
            isInstalling={installing[integration.name]}
            onInstall={() => handleInstall(integration.name)}
            onUninstall={() => handleUninstall(integration.name)}
            onUpdate={() => handleUpdate(integration.name)}
            onViewDetails={() => setSelectedIntegration(integration)}
          />
        ))}
      </div>

      {/* Empty state */}
      {filteredIntegrations.length === 0 && !loading && (
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            No integrations found
            {searchQuery && ` for "${searchQuery}"`}
            {selectedCategory !== 'all' && ` in ${selectedCategory}`}
          </p>
        </div>
      )}

      {/* Integration Detail Modal */}
      {selectedIntegration && (
        <IntegrationDetailModal
          integration={selectedIntegration}
          isInstalled={isInstalled(selectedIntegration.name)}
          isInstalling={installing[selectedIntegration.name]}
          onClose={() => setSelectedIntegration(null)}
          onInstall={() => handleInstall(selectedIntegration.name)}
          onUninstall={() => handleUninstall(selectedIntegration.name)}
          onUpdate={() => handleUpdate(selectedIntegration.name)}
          api={api}
        />
      )}
    </div>
  );
};

export default IntegrationBrowser;