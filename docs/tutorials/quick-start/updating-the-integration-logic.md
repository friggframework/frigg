# Updating the Integration Logic

Now that your Frigg app is installed fresh out of the box and your data is being fetched from your connected HubSpot account, how about we switch it up and display data from another section within the same CRM? Roll up your sleeves, now it’s time to get your hands code-dirty.

## Getting Started

Open your Frigg app project in your IDE. In the backend folder, look for the `/src/integrations` directory and open your `HubSpotIntegration.js` file.

## Understanding `HubSpotIntegration.js`

This file is where all the integration magic happens. It tells Frigg which API modules should be connected to use the integration and contains all of the integration logic. Here’s a simple breakdown:

* **API Modules**: Specifies which API modules are part of the integration.
* **Display Information**: Defines the display (description, label, categories, etc.) for the frontend.
* **Lifecycle Event Handlers**: Provides code/handlers for the lifecycle events of the integration (onCreate, onUpdate, onDelete).
* **Configuration Options**: Determines what users can configure for the integration (getConfigOptions).
* **Event Handlers**: Expands on the events that should trigger flows in the integration and defines handlers for those events.
* **User Actions**: Defines user actions available for leveraging the integration.

The power of this file lies in its ability to manage all aspects of the integration from a single point of entry. This allows for quicker development and easier maintenance.

## Swapping the Data Source

In the `HubSpotIntegration.js` file, find the `getSampleData` method. This is where the backend route fetches the data to display in the frontend.\
\
Update the code inside to fetch data from HubSpot’s "Companies" instead of "Deals" by replacing the original code with the following and saving the changes:

```javascript
async getSampleData() {
        const res = await this.target.api.listCompanies()
        console.log(res.results.length)
        const formatted = res.results.map(company => {
            const formattedCompany = {
                id: company.id,
                createdAt: company.createdAt,
                ...company.properties
            }


            return formattedCompany
        })
        return {data: formatted}

    }
```

To apply these changes, restart your Frigg app by terminating the backend process (command or ctrl & C) and running:

```
npm run start
```

This ensures the Frigg app backend service is updated with the new data fetching logic.

## **Testing Your Changes**

Go to your HubSpot account and add some company data manually or by importing a CSV file. For detailed steps, refer to the Connecting and Seeing Live Data section. Now refresh your app to see the new data displayed.

***

{% hint style="info" %}
Obviously, this is just a small change to the existing integration logic, not a fully fledged new feature. But one small change to the code has the potential to make a big impact for your integration users. Feel free to keep editing and exploring to get a feel for how simple it is to modify your existing integration logic, or check out our more advanced guides and tutorials to add more robust features.&#x20;
{% endhint %}

In our next section, we'll show how easy it is to get up and running with a fully new integration.&#x20;
