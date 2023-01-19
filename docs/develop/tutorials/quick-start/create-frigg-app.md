# Create Frigg App

Use `npx` to use the latest generator code, and just pass it whatever you want to name your Frigg application.&#x20;

{% hint style="info" %}
**Note on naming:** we recommend thinking of your Frigg app as a microservice that powers integrations; naming it something like "my-app-integrations" is a good fit
{% endhint %}

```
npx create-frigg-app [my-app-integrations]
cd [my-app-integrations]
```

Congrats! You've just successfully scaffolded and installed your Frigg application.

## Configuration

### Frontend
You will have to set up your own config files for the frontend of your application with: 

```
cd frontend
cp .env.example .env
```

### Backend
Currently, configuration is managed in two places for the backend. You can see the backend configuration here: `backend/src/configs/*.json` but you will also need a `.env` file in `/backend`.

```
cd backend
cp .env.example .env
```

## Start Your Application
Let's spin it up to explore more:

```
npm run start
```

Your browser should open to `http://localhost:3000`, and the backend should spin up an API route at `http://localhost:3001/dev/api`