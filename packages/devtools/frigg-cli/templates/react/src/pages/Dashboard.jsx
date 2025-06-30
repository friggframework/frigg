import { useEffect, useState } from 'react';
import { Card } from '@friggframework/ui/components';
import { LoadingSpinner } from '@friggframework/ui/components';
import { getIntegrations } from '../services/api';

export default function Dashboard() {
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

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6">
          <h3 className="text-lg font-medium mb-2">Active Integrations</h3>
          <p className="text-3xl font-bold text-primary">
            {integrations.filter(i => i.enabled).length}
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-medium mb-2">Total Integrations</h3>
          <p className="text-3xl font-bold text-primary">
            {integrations.length}
          </p>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-medium mb-2">API Calls Today</h3>
          <p className="text-3xl font-bold text-primary">1,234</p>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <Card className="p-6">
          <p className="text-muted-foreground">No recent activity to display.</p>
        </Card>
      </div>
    </div>
  );
}