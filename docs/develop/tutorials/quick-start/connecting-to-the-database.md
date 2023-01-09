# Connecting to the Database

Frigg has a fairly straightforward data model

![Frigg Data Model](<../../../.gitbook/assets/frigg data model.png>)

## Setting up a MongoDB with Atlas in the Cloud

* Currently we connect to a MongoDB cluster using Mongoose. Our recommendation is to use [MongoDB Atlas](https://account.mongodb.com/account/login), it is fast and free to spin up a test cluster.
* Follow [these instructions](https://www.mongodb.com/basics/create-database) to create a MongoDB instance. Then you can set the DB password like [this](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).
* Once this is set up, copy and paste your MongoDB Atlas url to the `backend/src/configs/dev.json` file in your new create-frigg-app applicaiton. 

## Example for backend/src/configs/dev.json
```
{
    "MONGO_URI": "mongodb+srv://<mongo_username>:<mongo_password>@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority",
    "REDIRECT_URI": "https://localhost:3000/redirect"
}
```
