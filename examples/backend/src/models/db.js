// Best Practices Connecting from AWS Lambda:
// https://dev.to/adnanrahic/building-a-serverless-rest-api-with-nodejs-and-mongodb-43db
// https://mongoosejs.com/docs/lambda.html
// https://www.mongodb.com/blog/post/optimizing-aws-lambda-performance-with-mongodb-atlas-and-nodejs

const mongoose = require('mongoose');
const { debug, flushDebugLog } = require('../utils/logger');

// Buffering means mongoose will queue up operations if it gets
// With serverless, better to fail fast if not connected.
// disconnected from MongoDB and send them when it reconnects.
const mongoConfig = {
    useFindAndModify: false,
    useNewUrlParser: true,
    bufferCommands: false, // Disable mongoose buffering
    bufferMaxEntries: 0, // and MongoDB driver buffering
    autoCreate: false, // Disable because auto creation does not work without buffering
    useUnifiedTopology: true,
    useCreateIndex: true,
    auto_reconnect: true,
    serverSelectionTimeoutMS: 5000,
};

const checkIsConnected = () => mongoose.connection?.readyState > 0;

module.exports.connectToDatabase = async () => {
    if (checkIsConnected()) {
        debug('=> using existing database connection');
        return;
    }

    debug('=> using new database connection');
    await mongoose.connect(process.env.MONGO_URI, mongoConfig);
    mongoose.connection.on('error', (error) => flushDebugLog(error));
};
