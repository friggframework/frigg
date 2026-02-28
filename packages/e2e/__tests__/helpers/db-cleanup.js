const mongoose = require('mongoose');

async function cleanupDatabase() {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        return;
    }

    const collections = mongoose.connection.collections;
    const promises = Object.values(collections).map((collection) =>
        collection.deleteMany({})
    );

    await Promise.all(promises);
}

async function cleanupCollection(collectionName) {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        return;
    }

    const collection = mongoose.connection.collections[collectionName];
    if (collection) {
        await collection.deleteMany({});
    }
}

async function getCollectionCounts() {
    if (!mongoose.connection || mongoose.connection.readyState !== 1) {
        return {};
    }

    const collections = mongoose.connection.collections;
    const counts = {};

    for (const [name, collection] of Object.entries(collections)) {
        counts[name] = await collection.countDocuments();
    }

    return counts;
}

module.exports = {
    cleanupDatabase,
    cleanupCollection,
    getCollectionCounts,
};
