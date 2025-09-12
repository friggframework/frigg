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
    console.log('📄 DocumentDB configuration detected, enabling TLS');
    console.log('📁 Current working directory:', process.cwd());
    console.log('📋 App definition database config:', JSON.stringify(appDefinition.database, null, 2));
    
    mongoConfig.tls = true;
    
    // Set TLS CA file path if specified
    if (appDefinition.database.documentDB.tlsCAFile) {
        const tlsCAFilePath = path.resolve(process.cwd(), appDefinition.database.documentDB.tlsCAFile);
        mongoConfig.tlsCAFile = tlsCAFilePath;
        
        console.log('📄 DocumentDB TLS CA file configured:');
        console.log('   📎 Original path:', appDefinition.database.documentDB.tlsCAFile);
        console.log('   📎 Resolved path:', tlsCAFilePath);
        console.log('   📄 File exists:', fs.existsSync(tlsCAFilePath));
        
        // List current directory contents for debugging
        try {
            console.log('📁 Current directory contents:');
            fs.readdirSync(process.cwd()).forEach(item => {
                const stats = fs.statSync(path.join(process.cwd(), item));
                console.log(`   ${stats.isDirectory() ? '📁' : '📄'} ${item}`);
            });
            
            // Check if security directory exists
            const securityDir = path.join(process.cwd(), 'security');
            if (fs.existsSync(securityDir)) {
                console.log('📁 Security directory contents:');
                fs.readdirSync(securityDir).forEach(item => {
                    console.log(`   📄 ${item}`);
                });
            } else {
                console.log('❌ Security directory does not exist at:', securityDir);
            }
        } catch (error) {
            console.log('❌ Error listing directory contents:', error.message);
        }
    }
} else {
    console.log('📄 DocumentDB not enabled, using standard MongoDB configuration');
}

const checkIsConnected = () => mongoose.connection?.readyState > 0;

const connectToDatabase = async () => {
    if (checkIsConnected()) {
        debug('=> using existing database connection');
        return;
    }

    console.log('🔗 Connecting to database...');
    console.log('🔗 MongoDB URI:', process.env.MONGO_URI ? 'SET' : 'NOT SET');
    console.log('🔧 Final mongoConfig:', JSON.stringify(mongoConfig, null, 2));
    
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
