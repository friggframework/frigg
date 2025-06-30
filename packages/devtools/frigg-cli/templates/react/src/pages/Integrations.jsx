import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { IntegrationList, IntegrationCard } from '@friggframework/ui/integration';
import { Button } from '@friggframework/ui/components';
import { LoadingSpinner } from '@friggframework/ui/components';
import { getIntegrations } from '../services/api';

export default function Integrations() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const data = await getIntegrations();
      setIntegrations(data);
    } catch (error) {
      console.error('Failed to load integrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (integrationId, enabled) => {
    // Update integration status
    console.log('Toggle integration:', integrationId, enabled);
    // TODO: Implement API call
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Integrations</h1>
        <Button>Add Integration</Button>
      </div>

      {integrations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No integrations configured yet.
          </p>
          <Button>Configure Your First Integration</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {integrations.map(integration => (
            <Link
              key={integration.id}
              to={`/integrations/${integration.id}`}
              className="block"
            >
              <IntegrationCard
                integration={integration}
                onToggle={(enabled) => handleToggle(integration.id, enabled)}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}