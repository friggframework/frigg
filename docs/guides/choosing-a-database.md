# Choosing a Database

Short version: use PostgreSQL. It's the default, and `frigg init` sets it up for you. Read on if you want MongoDB, or want to know what your options are when you deploy.

Frigg talks to every database through Prisma and the `DATABASE_URL` environment variable. You choose the database in the `database` block of your app definition (`index.js`).

## Your options

| Database | App definition | `frigg db:setup` does | Notes |
| --- | --- | --- | --- |
| **PostgreSQL** (default) | `postgres: { enable: true, management: 'external' }` | Runs Prisma migrations | `frigg init` writes this block, plus a local `DATABASE_URL` in `.env` |
| MongoDB | `mongoDB: { enable: true }` | Runs `prisma db push` | Must run as a replica set, even a single-node one |
| AWS DocumentDB | `documentDB: { enable: true }` | Runs `prisma db push` | Uses the MongoDB Prisma client. Needs TLS and replica-set compatibility. |

Enable only one. If you enable more than one, PostgreSQL wins, then MongoDB, then DocumentDB.

## Use PostgreSQL (the default)

A fresh `frigg init` app already has this in `index.js`:

```javascript
database: {
    postgres: {
        enable: true,
        management: 'external',
    },
},
```

and this in `.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/frigg
```

1. Start a local PostgreSQL:

   ```bash
   docker run --name frigg-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:16
   ```

2. Apply the schema:

   ```bash
   npm run db:setup
   ```

   With the default stage (`development`) this runs `prisma migrate dev`, and so do `dev`, `local` and `test`. Any other stage (for example `npm run db:setup -- --stage prod`) runs `prisma migrate deploy`.

### What `management` means for PostgreSQL

`management` decides whether `frigg deploy` creates database infrastructure on AWS for you.

| Value | What happens on deploy |
| --- | --- |
| `external` | Frigg creates nothing and connects through `DATABASE_URL`. Bring any hosted PostgreSQL. This is what `frigg init` writes. |
| `discover` | Frigg looks for an existing Aurora PostgreSQL in your AWS account. This is the default if you leave `management` out. |
| `managed` | Frigg manages an Aurora PostgreSQL for you. |
| `use-existing` | Frigg uses the Aurora cluster you name. Requires `endpoint`. |

With `external`, `frigg deploy` reads `DATABASE_URL` from your shell or CI job, not from `.env`. Require TLS:

```bash
DATABASE_URL='postgresql://user:password@host:5432/frigg?sslmode=require' npm run deploy -- --stage prod
```

## Use MongoDB instead

1. In `index.js`, replace the `database` block:

   ```javascript
   database: {
       mongoDB: { enable: true },
       postgres: { enable: false },
   },
   ```

2. Point `DATABASE_URL` at a replica set:

   ```
   DATABASE_URL=mongodb://localhost:27017/frigg?replicaSet=rs0
   ```

   MongoDB Atlas works too. Atlas connection strings always use TLS.

3. Push the schema:

   ```bash
   npm run db:setup
   ```

{% hint style="info" %}
Prisma needs MongoDB to run as a replica set. If `db:setup` complains, check that the replica set is initialized and that the URL includes `replicaSet=...`.
{% endhint %}

## See also

* [Data Model](../reference/data-model.md): the tables Frigg creates
* [Core Concepts](../reference/core-concepts.md)
