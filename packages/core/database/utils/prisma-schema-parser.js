/**
 * Prisma Schema Parser for MongoDB Collections
 *
 * Dynamically parses the Prisma schema file to extract MongoDB collection names.
 * This ensures collection names stay in sync with the schema without hardcoding.
 *
 * Handles:
 * - @@map() directives (custom collection names)
 * - Models without @@map() (uses model name)
 * - Comments and whitespace
 * - Multiple schema file locations
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse Prisma schema file to extract collection names
 *
 * Reads the schema.prisma file and extracts all model definitions,
 * returning the actual MongoDB collection names (from @@map directives).
 *
 * @param {string} schemaPath - Path to schema.prisma file
 * @returns {Promise<string[]>} Array of collection names
 *
 * @example
 * ```js
 * const collections = await parseCollectionsFromSchema('./prisma/schema.prisma');
 * // Returns: ['User', 'Token', 'Credential', ...]
 * ```
 */
async function parseCollectionsFromSchema(schemaPath) {
    try {
        const schemaContent = await fs.promises.readFile(schemaPath, 'utf-8');
        return extractCollectionNames(schemaContent);
    } catch (error) {
        throw new Error(
            `Failed to parse Prisma schema at ${schemaPath}: ${error.message}`
        );
    }
}

/**
 * Synchronous version of parseCollectionsFromSchema
 *
 * @param {string} schemaPath - Path to schema.prisma file
 * @returns {string[]} Array of collection names
 */
function parseCollectionsFromSchemaSync(schemaPath) {
    try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        return extractCollectionNames(schemaContent);
    } catch (error) {
        throw new Error(
            `Failed to parse Prisma schema at ${schemaPath}: ${error.message}`
        );
    }
}

/**
 * Extract collection names from Prisma schema content
 *
 * Parses the schema content to find:
 * 1. All model definitions
 * 2. Their @@map() directives (if present)
 * 3. Falls back to model name if no @@map()
 *
 * @param {string} schemaContent - Content of schema.prisma file
 * @returns {string[]} Array of collection names
 * @private
 */
function extractCollectionNames(schemaContent) {
    const collections = [];

    // Match model blocks: "model ModelName { ... }"
    // Using non-greedy match to handle multiple models
    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;

    let match;
    while ((match = modelRegex.exec(schemaContent)) !== null) {
        const modelName = match[1];
        const modelBody = match[2];

        // Look for @@map("CollectionName") directive
        const mapMatch = modelBody.match(/@@map\s*\(\s*["'](\w+)["']\s*\)/);

        if (mapMatch) {
            // Use mapped collection name
            collections.push(mapMatch[1]);
        } else {
            // Use model name as collection name (Prisma default)
            collections.push(modelName);
        }
    }

    return collections;
}

/**
 * Find Prisma MongoDB schema file
 *
 * Searches for the schema.prisma file in common locations:
 * 1. prisma-mongodb/schema.prisma (Frigg convention)
 * 2. prisma/schema.prisma (Prisma default)
 * 3. schema.prisma (root)
 *
 * @param {string} startDir - Directory to start searching from
 * @returns {string|null} Path to schema file, or null if not found
 */
function findMongoDBSchemaFile(startDir = __dirname) {
    // Start from database directory and work up
    const baseDir = path.resolve(startDir, '../..');

    const searchPaths = [
        path.join(baseDir, 'prisma-mongodb', 'schema.prisma'),
        path.join(baseDir, 'prisma', 'schema.prisma'),
        path.join(baseDir, 'schema.prisma'),
    ];

    for (const schemaPath of searchPaths) {
        if (fs.existsSync(schemaPath)) {
            return schemaPath;
        }
    }

    return null;
}

/**
 * Get MongoDB collection names from Prisma schema
 *
 * Convenience function that finds and parses the schema automatically.
 *
 * @returns {Promise<string[]>} Array of collection names
 * @throws {Error} If schema file not found or parsing fails
 *
 * @example
 * ```js
 * const collections = await getCollectionsFromSchema();
 * await ensureCollectionsExist(collections);
 * ```
 */
async function getCollectionsFromSchema() {
    const schemaPath = findMongoDBSchemaFile();

    if (!schemaPath) {
        throw new Error(
            'Could not find Prisma MongoDB schema file. ' +
                'Searched: prisma-mongodb/schema.prisma, prisma/schema.prisma, schema.prisma'
        );
    }

    return await parseCollectionsFromSchema(schemaPath);
}

/**
 * Synchronous version of getCollectionsFromSchema
 *
 * @returns {string[]} Array of collection names
 * @throws {Error} If schema file not found or parsing fails
 */
function getCollectionsFromSchemaSync() {
    const schemaPath = findMongoDBSchemaFile();

    if (!schemaPath) {
        throw new Error(
            'Could not find Prisma MongoDB schema file. ' +
                'Searched: prisma-mongodb/schema.prisma, prisma/schema.prisma, schema.prisma'
        );
    }

    return parseCollectionsFromSchemaSync(schemaPath);
}

module.exports = {
    parseCollectionsFromSchema,
    parseCollectionsFromSchemaSync,
    extractCollectionNames,
    findMongoDBSchemaFile,
    getCollectionsFromSchema,
    getCollectionsFromSchemaSync,
};
