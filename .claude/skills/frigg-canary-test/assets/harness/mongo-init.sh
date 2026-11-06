#!/bin/bash
# Initialise the rs0 single-node replica set so Prisma can connect to MongoDB.
set -e

echo "Waiting for mongod to accept connections..."
until mongosh --quiet --eval "db.adminCommand('ping')" >/dev/null 2>&1; do
    sleep 1
done

echo "Ensuring replica set rs0 is initiated..."
mongosh --quiet --eval '
    try {
        rs.status();
        print("replica set already initialised");
    } catch (e) {
        rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "localhost:27017" }] });
        print("replica set initiated");
    }
'
