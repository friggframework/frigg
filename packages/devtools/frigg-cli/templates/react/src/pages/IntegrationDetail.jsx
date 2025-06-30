import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Button } from '@friggframework/ui/components';
import { LoadingSpinner } from '@friggframework/ui/components';
import { getIntegrationById } from '../services/api';

export default function IntegrationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [integration, setIntegration] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadIntegration();
  }, [id]);

  const loadIntegration = async () => {
    try {
      const data = await getIntegrationById(id);
      setIntegration(data);
    } catch (error) {
      console.error('Failed to load integration:', error);
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

  if (!integration) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Integration not found.</p>
        <Button onClick={() => navigate('/integrations')}>
          Back to Integrations
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{integration.name}</h1>
        <Button variant="outline" onClick={() => navigate('/integrations')}>
          Back
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Configuration</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  API Key
                </label>
                <input
                  type="password"
                  value="••••••••••••••••"
                  readOnly
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Webhook URL
                </label>
                <input
                  type="text"
                  value={integration.webhookUrl || 'Not configured'}
                  readOnly
                  className="w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 mt-6">
            <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
            <p className="text-muted-foreground">No recent activity.</p>
          </Card>
        </div>

        <div>
          <Card className="p-6">
            <h3 className="text-lg font-medium mb-4">Status</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">Enabled</span>
                <span className={`text-sm font-medium ${
                  integration.enabled ? 'text-green-600' : 'text-red-600'
                }`}>
                  {integration.enabled ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Last Sync</span>
                <span className="text-sm text-muted-foreground">
                  2 hours ago
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">API Calls Today</span>
                <span className="text-sm font-medium">127</span>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <Button className="w-full">Test Connection</Button>
              <Button variant="outline" className="w-full">
                View Logs
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}