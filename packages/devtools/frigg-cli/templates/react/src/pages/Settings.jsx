import { Card, Button } from '@friggframework/ui/components';
import { EnvironmentEditor } from '@friggframework/ui/environment';

export default function Settings() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Environment Variables</h2>
          <EnvironmentEditor />
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">API Configuration</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                API Base URL
              </label>
              <input
                type="text"
                value="http://localhost:3001/api"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Request Timeout (ms)
              </label>
              <input
                type="number"
                value="30000"
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
          </div>
          <Button className="mt-4">Save Configuration</Button>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Developer Tools</h2>
          <div className="space-y-3">
            <Button variant="outline" className="w-full sm:w-auto">
              Export Configuration
            </Button>
            <Button variant="outline" className="w-full sm:w-auto ml-0 sm:ml-2">
              Import Configuration
            </Button>
            <Button variant="outline" className="w-full sm:w-auto ml-0 sm:ml-2">
              Reset to Defaults
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}