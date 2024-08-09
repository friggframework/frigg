import "./App.css";
import IntegrationHorizontal from "../lib/integration/IntegrationHorizontal.jsx";

function App() {
  const integration = {
    id: "66b3ba23dae2d9f11c8767e2",
    status: "ENABLED",
    config: {
      type: "hubspot",
      category: "CRM",
    },
    entities: [
      {
        id: "66b3b29b0ca718e02dea0d12",
        name: "Daniels-test-account-dev-46918003.com",
        externalId: "46918003",
        __t: "HubSpotEntity",
      },
      {
        id: "66b3b29b0ca718e02dea0d12",
        name: "Daniels-test-account-dev-46918003.com",
        externalId: "46918003",
        __t: "HubSpotEntity",
      },
    ],
    version: "0.0.0",
    messages: {
      errors: [],
      warnings: [],
      info: [],
      logs: [],
    },
    userActions: [],
    type: "hubspot",
    display: {
      name: "HubSpot",
      description: "Sales & CRM, Marketing",
      detailsUrl: "https://hubspot.com",
      icon: "https://www.hubspot.com/hubfs/2023_Sprocket1.svg",
    },
  };

  const setInstalled = (installed) => {
    console.log(installed);
  };

  const refreshIntegrations = () => {
    console.log("Refresh Clicked!");
  };

  return (
    <>
      <div>
        <IntegrationHorizontal
          friggBaseUrl="http://localhost:3001/dev"
          data={integration}
          key={`combined-integration-${integration.type}`}
          handleInstall={setInstalled}
          refreshIntegrations={refreshIntegrations}
          authToken="your-auth-token-here"
          sampleDataRoute="/sample-data/hubspot"
        />
      </div>
    </>
  );
}

export default App;
