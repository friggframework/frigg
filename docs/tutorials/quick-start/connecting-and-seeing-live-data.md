# Connecting and Seeing Live Data

If you haven't already, select the "Create account (demo user)" option from the Login menu, a new user will be created for you with the pre-populated data you see on screen.\
After getting a successful confirmation, you're able to log in as the Demo User.

You will see the Dashboard with HubSpot as an available connection.

<figure><img src="../../.gitbook/assets/image (9).png" alt="" width="563"><figcaption><p>Your Dashboard in Frigg with your available integrations</p></figcaption></figure>

Click on the Connect button next to it and follow HubSpot's authorization flow.

You should now see a connected HubSpot card. Now it's time to see your app in action with live data from HubSpot!

### Facing the No data available error

Select "Get Sample Data" from the HubSpot app dropdown menu to see live data fetched from your test account, you might see a "No data available" message. This is totally normal given that we didn't add any into your HubSpot account, so we have nothing there to fetch.

<figure><img src="../../.gitbook/assets/image (10).png" alt="" width="563"><figcaption><p>Oops! Looks like we forgot to add some test data</p></figcaption></figure>

### Adding Test Data

To fix this, let's add some test data to your HubSpot account:

From your HubSpot dashboard you should go to the "Deals" section in the CRM menu.\
Click "Create deal" to manually add details and save, or use the "Import" option to upload a CSV file with your test data.

<figure><img src="../../.gitbook/assets/image (11).png" alt=""><figcaption><p>You can find the Deals section inside the CRM menu</p></figcaption></figure>

{% hint style="info" %}
For more detailed instructions on how to add data, you can visit the [HubSpot documentation](https://developers.hubspot.com/docs/api/crm/deals).
{% endhint %}

Once you've added the test data, refresh the page and select "Get Sample Data" from the HubSpot app dropdown menu.\
Now you should see your created deals. Seeing the data you just entered confirms that everything is connected and working correctly!

<figure><img src="../../.gitbook/assets/image (12).png" alt="" width="563"><figcaption><p>We see you, Antique Star Wars Droids collection!</p></figcaption></figure>

***

And that’s it! You’ve successfully created and configured your Frigg app with HubSpot and are seeing the test data you added during the configuration process. Time to explore and have fun with your new setup!
