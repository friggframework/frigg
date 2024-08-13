# Initialize With Create Frigg App (CFA)

### Use `npx` to Create the App

Be sure to double-check that you have all the [prerequisite tools installed](./) before attempting this tutorial.

Open your terminal and cd to a location where you want to install your Frigg application. Then run the following command to create a new Frigg app, replacing `[my-app-integrations]` with your desired app name:

```
npx create-frigg-app [my-app-integrations]
```

{% hint style="info" %}
**Note on naming:** We recommend naming your Frigg app something descriptive that reflects its purpose as a microservice that powers integrations; For example, "my-app-integrations" is a good fit.
{% endhint %}

This process might take a couple of minutes to complete, but at the end of it you should see something like this in your terminal:

<figure><img src="../../.gitbook/assets/Screenshot 2024-08-13 at 3.07.12 PM (1).png" alt=""><figcaption><p>Your terminal once Create Frigg App is completed</p></figcaption></figure>

{% hint style="warning" %}
During the installation process, you will likely encounter warnings related to deprecated dependencies and Git initialization errors. These warnings are expected and will not impact your ability to run Frigg successfully. We are working to resolve any/all warnings, but we do not believe they indicate any acute security or functionality concerns. If you have any concerns, please contact us.
{% endhint %}

Now navigate to your newly created app directory using the following command:

```
cd [my-app-integrations]
```

Congrats! You've just successfully scaffolded and installed your Frigg app. Continue with further configuration and customization.
