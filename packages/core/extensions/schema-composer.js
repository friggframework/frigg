/**
 * Schema Composer
 *
 * Merges extension .prisma schema fragments with a base Prisma schema.
 * Extensions can add new models/enums that get composed into the final schema
 * used for `prisma generate` and migrations.
 *
 * Two approaches are supported:
 * 1. Build-time merge: Concatenate model definitions from extension files
 *    into the base schema and write a merged output file.
 * 2. Multi-file schema (Prisma 5.15+): Return a list of schema paths for
 *    Prisma's native `prismaSchemaFolder` feature.
 *
 * @example
 * const { composeSchemas } = require('@friggframework/core/extensions/schema-composer');
 *
 * // Build-time merge — writes a merged schema file
 * await composeSchemas({
 *   baseSchemaPath: '/path/to/prisma-postgresql/schema.prisma',
 *   extensionSchemaPaths: ['/path/to/extensions/db-credentials/schema.prisma'],
 *   outputPath: '/path/to/prisma-postgresql/schema.composed.prisma',
 * });
 */

const fs = require('fs');
const path = require('path');

/**
 * Extracts model/enum blocks from a .prisma file, stripping out
 * generator and datasource blocks (which should only appear in the base schema).
 *
 * @param {string} schemaContent - Raw .prisma file content
 * @returns {string} Only model/enum/type definitions
 */
function extractModelBlocks(schemaContent) {
    const lines = schemaContent.split('\n');
    const result = [];
    let depth = 0;
    let inBlock = false;
    let blockType = null;

    for (const line of lines) {
        const trimmed = line.trim();

        // Detect block start
        if (depth === 0 && !inBlock) {
            const blockMatch = trimmed.match(
                /^(model|enum|type)\s+\w+\s*\{/
            );
            if (blockMatch) {
                inBlock = true;
                blockType = blockMatch[1];
                result.push(line);
                depth += (line.match(/\{/g) || []).length;
                depth -= (line.match(/\}/g) || []).length;
                continue;
            }

            // Skip generator/datasource blocks
            const skipMatch = trimmed.match(
                /^(generator|datasource)\s+\w+\s*\{/
            );
            if (skipMatch) {
                inBlock = true;
                blockType = 'skip';
                depth += (line.match(/\{/g) || []).length;
                depth -= (line.match(/\}/g) || []).length;
                continue;
            }

            // Keep standalone comments between blocks
            if (trimmed.startsWith('//') || trimmed === '') {
                // Only keep if we've already accumulated some model blocks
                if (result.length > 0) {
                    result.push(line);
                }
                continue;
            }
        } else if (inBlock) {
            depth += (line.match(/\{/g) || []).length;
            depth -= (line.match(/\}/g) || []).length;

            if (blockType !== 'skip') {
                result.push(line);
            }

            if (depth <= 0) {
                inBlock = false;
                blockType = null;
                depth = 0;
                if (result.length > 0) {
                    result.push(''); // blank line between blocks
                }
            }
        }
    }

    return result.join('\n').trim();
}

/**
 * Composes a merged Prisma schema from a base schema + extension fragments.
 *
 * @param {Object} options
 * @param {string} options.baseSchemaPath - Absolute path to the core .prisma file
 * @param {string[]} options.extensionSchemaPaths - Absolute paths to extension .prisma files
 * @param {string} [options.outputPath] - Where to write the merged schema.
 *   Defaults to `<baseDir>/schema.composed.prisma`
 * @returns {string} The merged schema content
 */
function composeSchemas({ baseSchemaPath, extensionSchemaPaths, outputPath }) {
    if (!baseSchemaPath) {
        throw new Error('baseSchemaPath is required');
    }

    if (
        !extensionSchemaPaths ||
        !Array.isArray(extensionSchemaPaths) ||
        extensionSchemaPaths.length === 0
    ) {
        // No extensions — just return base schema as-is
        const baseContent = fs.readFileSync(baseSchemaPath, 'utf-8');
        return baseContent;
    }

    const baseContent = fs.readFileSync(baseSchemaPath, 'utf-8');

    // Collect model blocks from each extension
    const extensionBlocks = [];
    for (const extPath of extensionSchemaPaths) {
        if (!fs.existsSync(extPath)) {
            throw new Error(
                `Extension schema not found: ${extPath}`
            );
        }
        const extContent = fs.readFileSync(extPath, 'utf-8');
        const models = extractModelBlocks(extContent);
        if (models) {
            extensionBlocks.push(
                `// --- Extension schema from: ${path.basename(path.dirname(extPath))}/${path.basename(extPath)} ---`,
                models
            );
        }
    }

    if (extensionBlocks.length === 0) {
        return baseContent;
    }

    // Append extension models to the base schema
    const merged = [
        baseContent.trimEnd(),
        '',
        '// =========================================================================',
        '// Extension Models (auto-composed — do not edit manually)',
        '// =========================================================================',
        '',
        ...extensionBlocks,
        '',
    ].join('\n');

    // Write the merged schema if outputPath is specified
    const resolvedOutput =
        outputPath ||
        path.join(path.dirname(baseSchemaPath), 'schema.composed.prisma');

    fs.writeFileSync(resolvedOutput, merged, 'utf-8');

    return merged;
}

/**
 * Returns schema paths suitable for Prisma's native multi-file schema support
 * (prismaSchemaFolder feature, Prisma 5.15+).
 *
 * @param {string} baseSchemaPath - Path to the core schema
 * @param {string[]} extensionSchemaPaths - Paths to extension schemas
 * @returns {string[]} All schema file paths
 */
function getSchemaFilePaths(baseSchemaPath, extensionSchemaPaths) {
    return [baseSchemaPath, ...(extensionSchemaPaths || [])];
}

module.exports = {
    composeSchemas,
    extractModelBlocks,
    getSchemaFilePaths,
};
