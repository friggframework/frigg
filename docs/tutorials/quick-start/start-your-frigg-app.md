# Start Your Frigg App

Time to make it go. Three commands, all run from your app folder.

## 1. Start PostgreSQL

This is the Docker one-liner `frigg init` printed:

```bash
docker run --name frigg-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
```

It matches the `DATABASE_URL` in `.env` (`postgresql://postgres:postgres@localhost:5432/frigg`). Already have PostgreSQL running somewhere? Point `DATABASE_URL` in `.env` at it and skip this step.

## 2. Set up the database

```bash
npm run db:setup
```

This runs `frigg db:setup`. It generates the Prisma client, checks it can connect, and applies Frigg's migrations. With the default stage (`development`) it uses `prisma migrate dev`, which creates the `frigg` database if it doesn't exist yet. You should finish with:

```
✅ Database setup completed successfully!
```

## 3. Start the backend

```bash
npm start
```

This runs `frigg start`, which runs your app under serverless-offline (stage `dev` by default) and reads `.env`. After a few seconds you'll see a table of routes and:

```
Server ready: http://localhost:3001 🚀
```

Check it's alive from another terminal:

```bash
curl http://localhost:3001/health
```

A `200` response means you're in business. To stop the backend, press `Ctrl+C`.

{% hint style="info" %}
`frigg start` serves on port **3001**. Keep that in mind if something else on your machine likes that port too.
{% endhint %}

Next: [add an integration](add-an-integration.md).
