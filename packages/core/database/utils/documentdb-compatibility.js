/**
 * DocumentDB Compatibility Utilities
 * 
 * DocumentDB doesn't support certain MongoDB features:
 * - $$REMOVE system variable (used in aggregation pipeline updates)
 * - $$CURRENT system variable
 * - Some aggregation operators
 * 
 * These utilities help ensure Prisma operations work with DocumentDB.
 */

/**
 * Remove undefined values from an object to prevent Prisma from using $$REMOVE
 * 
 * Prisma's MongoDB driver uses aggregation pipeline updates when it detects undefined values.
 * This causes it to use $$REMOVE which DocumentDB doesn't support.
 * 
 * @param {Object} obj - Object to clean
 * @returns {Object} Object without undefined values
 */
function removeUndefinedValues(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
    }

    const cleaned = {};
    
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) {
            continue; // Skip undefined values
        }
        
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Recursively clean nested objects
            cleaned[key] = removeUndefinedValues(value);
        } else {
            cleaned[key] = value;
        }
    }
    
    return cleaned;
}

/**
 * Check if running on DocumentDB (vs MongoDB)
 * 
 * DocumentDB connection strings typically include:
 * - docdb.amazonaws.com domain
 * - retryWrites=false parameter
 * 
 * @returns {boolean} True if DocumentDB detected
 */
function isDocumentDB() {
    const connectionString = process.env.DATABASE_URL || process.env.MONGO_URI || '';
    return connectionString.includes('docdb.amazonaws.com') || 
           connectionString.includes('documentdb');
}

module.exports = {
    removeUndefinedValues,
    isDocumentDB,
};

