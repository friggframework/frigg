// Best Practices Connecting from AWS Lambda:
// https://dev.to/adnanrahic/building-a-serverless-rest-api-with-nodejs-and-mongodb-43db
// https://mongoosejs.com/docs/lambda.html
// https://www.mongodb.com/blog/post/optimizing-aws-lambda-performance-with-mongodb-atlas-and-nodejs
const { Encrypt } = require('../encrypt');
const { mongoose } = require('./mongoose');
const { debug, flushDebugLog } = require('../logs');
const { findNearestBackendPackageJson } = require('../utils');
const path = require('path');
const fs = require('fs');

mongoose.plugin(Encrypt);
mongoose.set('applyPluginsToDiscriminators', true); // Needed for LHEncrypt

// Load app definition to check for DocumentDB configuration
let appDefinition = {};
try {
    const backendPath = findNearestBackendPackageJson();
    if (backendPath) {
        const backendDir = path.dirname(backendPath);
        const backendFilePath = path.join(backendDir, 'index.js');
        if (fs.existsSync(backendFilePath)) {
            const backendJsFile = require(backendFilePath);
            appDefinition = backendJsFile.Definition || {};
        }
    }
} catch (error) {
    debug('Could not load app definition for DocumentDB configuration:', error.message);
}

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

// Add DocumentDB TLS configuration if enabled
if (appDefinition.database?.documentDB?.enable === true) {
    debug('DocumentDB configuration detected, enabling TLS');
    mongoConfig.tls = true;
    
    // Set TLS CA file path if specified
    if (appDefinition.database.documentDB.tlsCAFile) {
        const tlsCAFilePath = path.resolve(process.cwd(), appDefinition.database.documentDB.tlsCAFile);
        mongoConfig.tlsCAFile = tlsCAFilePath;
        debug(`DocumentDB TLS CA file: ${tlsCAFilePath}`);
    }
}

const checkIsConnected = () => mongoose.connection?.readyState > 0;

const connectToDatabase = async () => {
    if (checkIsConnected()) {
        debug('=> using existing database connection');
        return;
    }

    debug('=> using new database connection');
    await mongoose.connect(process.env.MONGO_URI, mongoConfig);
    debug('Connection state:',  mongoose.STATES[mongoose.connection.readyState]);
    mongoose.connection.on('error', (error) => flushDebugLog(error));
};

const disconnectFromDatabase = async () => mongoose.disconnect();

const createObjectId = () => new mongoose.Types.ObjectId();

module.exports = {
    connectToDatabase,
    disconnectFromDatabase,
    createObjectId,
};
