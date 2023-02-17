// Best Practices Connecting from AWS Lambda:
// https://dev.to/adnanrahic/building-a-serverless-rest-api-with-nodejs-and-mongodb-43db
// https://mongoosejs.com/docs/lambda.html
// https://www.mongodb.com/blog/post/optimizing-aws-lambda-performance-with-mongodb-atlas-and-nodejs
const { Encrypt } = require('@friggframework/encrypt');
const mongoose = require('mongoose'); // TODO maybe pass in / see what best way to make sure we have the same mongoose instance as the including package (something like peerDependencies but not deprecated)
const { debug, flushDebugLog } = require('@friggframework/logs');

mongoose.plugin(Encrypt);
mongoose.set('applyPluginsToDiscriminators', true); // Needed for LHEncrypt

// Buffering means mongoose will queue up operations if it gets
// With serverless, better to fail fast if not connected.
// disconnected from MongoDB and send them when it reconnects.
const mongoConfig = {
    useNewUrlParser: true,
    bufferCommands: false, // Disable mongoose buffering
    autoCreate: false, // Disable because auto creation does not work without buffering
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
};

const checkIsConnected = () => mongoose.connection?.readyState > 0;

const connectToDatabase = async () => {
    if (checkIsConnected()) {
        debug('=> using existing database connection');
        return;
    }

    debug('=> using new database connection');
    mongoose.set('strictQuery', false);
    await mongoose.connect(process.env.MONGO_URI, mongoConfig);
    mongoose.connection.on('error', (error) => flushDebugLog(error));
};

module.exports = {
    connectToDatabase,
};
