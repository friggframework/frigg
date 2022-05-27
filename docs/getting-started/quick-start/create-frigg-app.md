# Create Frigg App

Use `npx` to use the latest generator code, and just pass it whatever you want to name your frigg application.&#x20;

{% hint style="info" %}
**Note on naming:** we recommend thinking of your Frigg app as a microservice that powers integrations; naming it something like "my-app-integrations" is a good fit
{% endhint %}

```
npx create-frigg-app [my-app-integrations]
```

Congrats! You've just successfully scaffolded and installed your first Frigg application.

Let's spin it up to explore more:

```
cd [my-app-integrations]
npm run start
```

Your browser should open to `http://localhost:3000`, and the backend should spin up an API route at `http://localhost:3001/dev/api`
