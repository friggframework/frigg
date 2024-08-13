# Connecting and Seeing Live Data

If you haven't already, select the "Create account (demo user)" option from the Login menu. A new user will be created for you with the pre-populated data you see on screen.

After receiving a successful confirmation message, you're now able to log in as the Demo User.

You will see a directory with HubSpot as an available connection.

<figure><img src="../../.gitbook/assets/Screenshot 2024-08-12 at 6.50.07 PM.png" alt=""><figcaption><p>Your Dashboard in Frigg with the HubSpot Integration Available for Testing</p></figcaption></figure>

Click on the "Connect" button and complete HubSpot's authorization flow.

When finished, you should see a connected HubSpot card. Now it's time to see your app in action with live data from HubSpot!

### "No Data Available" error

Select "Get Sample Data" from the HubSpot app dropdown menu to see live data fetched from your test account.

Note that you might receive a "No data available" message. This is totally normal, given that we didn't add any info to your HubSpot account. There's nothing for our integration to fetch (yet).

<figure><img src="../../.gitbook/assets/Screenshot 2024-08-12 at 6.57.22 PM.png" alt=""><figcaption><p>Oops! Looks like we forgot to add some test data to HubSpot</p></figcaption></figure>

### Adding Test Data to HubSpot

To fix this, let's add some test data to your HubSpot account. From your HubSpot dashboard, you should go to the "Deals" section in the CRM menu.\


Click "Create Deal" to manually add details and save, or use the "Import" option to upload a CSV file with test data.

<figure><img src="../../.gitbook/assets/image (11).png" alt=""><figcaption><p>You can find the Deals section inside the CRM menu</p></figcaption></figure>

{% hint style="info" %}
For more detailed instructions on how to add test data, visit the [HubSpot documentation](https://developers.hubspot.com/docs/api/crm/deals).
{% endhint %}

Once you've added test data, refresh the page and select "Get Sample Data" again. Now you should see Deals data displayed in your app. This confirms that everything is connected and working correctly!

<figure><img src="../../.gitbook/assets/Screenshot 2024-08-12 at 6.59.00 PM.png" alt=""><figcaption><p>We see you, Antique Star Wars Droids collection!</p></figcaption></figure>

***

And that’s it! You’ve successfully created and configured your Frigg app with HubSpot. Time to explore and have fun with your new setup!
