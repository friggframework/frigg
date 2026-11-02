# Use MongoDB Instead

PostgreSQL is the default, and the rest of this tutorial assumes it. Prefer MongoDB? It's a two-line swap.

## 1. Change the app definition

In `index.js`, replace the `database` block with:

```javascript
database: {
    mongoDB: { enable: true },
    postgres: { enable: false },
},
```

## 2. Point `DATABASE_URL` at MongoDB

Prisma needs MongoDB to run as a **replica set**, even a single-node one. In `.env`:

```
DATABASE_URL=mongodb://localhost:27017/frigg?replicaSet=rs0
```

A hosted MongoDB Atlas cluster works too. Atlas connection strings always use TLS.

## 3. Set up and start

```bash
npm run db:setup
npm start
```

For MongoDB, `frigg db:setup` generates the MongoDB Prisma client and runs `prisma db push` instead of migrations. `npm start` works the same as before.
