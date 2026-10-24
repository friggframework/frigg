/**
 * Prisma composer: puts core extensions' models into the Prisma client.
 *
 * Core ships one generated client per database (`generated/prisma-<db>`),
 * built from `prisma-<db>/schema.prisma`. A core extension that declares a
 * schema (`coreExtensions[].schema`) needs its models in that client, and on
 * PostgreSQL its tables need migrations (`coreExtensions[].migrations`).
 * Without this step the extension's models exist nowhere: every call to
 * `prisma.<model>` is undefined, and the table is never created.
 *
 * At build time, for each database the app uses:
 *   1. The pristine core schema is kept as `schema.base.prisma` (taken from
 *      `schema.prisma` the first time), so composing again never appends twice.
 *   2. `schema.prisma` becomes base + the extensions' models. Everything that
 *      reads the schema (prisma generate, the migration runner, the Lambda
 *      layer, which copies the generated client's schema) sees the composed one.
 *   3. PostgreSQL: each extension migration folder is copied into
 *      `prisma-postgresql/migrations`, so `prisma migrate deploy` applies it in
 *      timestamp order with the core migrations.
 *   4. `prisma generate` rebuilds `generated/prisma-<db>` from the composed
 *      schema, only when the schema changed or the client is missing.
 *
 * Removing every extension restores the base schema and regenerates. Copied
 * migrations are left in place: a migration that may already be applied must
 * not disappear from the history.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
    loadExtensions,
    getExtensionSchemaPaths,
} = require('./extension-loader');
const { extractModelBlocks } = require('./schema-composer');

const DB_TYPES = ['postgresql', 'mongodb'];

/**
 * The Prisma databases an app definition uses. DocumentDB uses the MongoDB client.
 * @param {Object} appDefinition
 * @returns {Array<'postgresql'|'mongodb'>}
 */
function resolvePrismaDbTypes(appDefinition) {
    const db = appDefinition?.database || {};
    const types = [];
    if (db.postgres?.enable) types.push('postgresql');
    if (db.mongoDB?.enable || db.documentDB?.enable) types.push('mongodb');
    return types;
}

function blockNames(schemaContent) {
    const names = [];
    const re = /^\s*(model|enum|type|view)\s+(\w+)\s*\{/gm;
    let match;
    while ((match = re.exec(schemaContent)) !== null) names.push(match[2]);
    return names;
}

/**
 * Base schema + the extensions' model blocks. Throws when an extension
 * declares a model, enum or type the base (or another extension) already has.
 */
function buildComposedSchema(baseContent, extensionSchemaPaths) {
    const seen = new Map(
        blockNames(baseContent).map((name) => [name, 'the core schema'])
    );
    const sections = [];

    for (const extPath of extensionSchemaPaths) {
        if (!fs.existsSync(extPath)) {
            throw new Error(`Extension schema not found: ${extPath}`);
        }
        const blocks = extractModelBlocks(fs.readFileSync(extPath, 'utf-8'));
        if (!blocks) continue;
        for (const name of blockNames(blocks)) {
            if (seen.has(name)) {
                throw new Error(
                    `Extension schema ${extPath} declares "${name}", already declared by ${seen.get(
                        name
                    )}`
                );
            }
            seen.set(name, extPath);
        }
        sections.push(`// --- Extension schema: ${extPath} ---`, blocks, '');
    }

    if (sections.length === 0) return baseContent;

    return [
        baseContent.trimEnd(),
        '',
        '// =========================================================================',
        '// Extension models (composed by @friggframework/core at build; do not edit)',
        '// =========================================================================',
        '',
        ...sections,
    ].join('\n');
}

/**
 * Copies each extension's migration folders into the core migrations
 * directory. A folder already there with the same migration.sql is skipped;
 * a different one under the same name is an error (it would silently be a
 * different migration with an applied migration's name).
 * @returns {string[]} names of the folders copied
 */
function copyExtensionMigrations(extensions, migrationsDir) {
    const copied = [];
    for (const ext of extensions) {
        if (!ext.migrations) continue;
        if (
            !fs.existsSync(ext.migrations) ||
            !fs.statSync(ext.migrations).isDirectory()
        ) {
            throw new Error(
                `Extension "${ext.name}" migrations directory not found: ${ext.migrations}`
            );
        }
        const folders = fs
            .readdirSync(ext.migrations, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
        for (const folder of folders) {
            const source = path.join(ext.migrations, folder, 'migration.sql');
            if (!fs.existsSync(source)) {
                throw new Error(
                    `Extension "${ext.name}" migration ${folder} has no migration.sql`
                );
            }
            const sql = fs.readFileSync(source, 'utf-8');
            const destDir = path.join(migrationsDir, folder);
            const dest = path.join(destDir, 'migration.sql');
            if (fs.existsSync(dest)) {
                if (fs.readFileSync(dest, 'utf-8') !== sql) {
                    throw new Error(
                        `Migration ${folder} from extension "${ext.name}" conflicts with an existing migration of the same name`
                    );
                }
                continue;
            }
            fs.mkdirSync(destDir, { recursive: true });
            fs.writeFileSync(dest, sql, 'utf-8');
            copied.push(folder);
        }
    }
    return copied;
}

/**
 * Runs `prisma generate` with the Prisma CLI installed beside core (the app's
 * own `prisma`), falling back to npx.
 */
function defaultGenerate({ schemaPath, corePath }) {
    let cli;
    try {
        cli = require.resolve('prisma/build/index.js', {
            paths: [corePath, process.cwd()],
        });
    } catch {
        cli = null;
    }
    const [command, args] = cli
        ? [process.execPath, [cli, 'generate', `--schema=${schemaPath}`]]
        : ['npx', ['prisma', 'generate', `--schema=${schemaPath}`]];
    execFileSync(command, args, { cwd: corePath, stdio: 'inherit' });
}

/**
 * Composes the extensions' schemas and migrations into core's Prisma schema
 * and regenerates the client when it changed.
 *
 * @param {Object} params
 * @param {Object} params.appDefinition
 * @param {string} params.corePath - Directory of the installed @friggframework/core
 * @param {Array<'postgresql'|'mongodb'>} [params.dbTypes] - Defaults to the app definition's databases
 * @param {Function} [params.generate] - ({ schemaPath, corePath, dbType }) => void
 * @param {Function} [params.log]
 * @returns {{ changed: boolean, results: Array<Object> }}
 */
function composeExtensionPrisma({
    appDefinition,
    corePath,
    dbTypes,
    generate = defaultGenerate,
    log = (message) => console.log(message),
}) {
    if (!corePath) throw new Error('corePath is required');
    const extensions = loadExtensions(appDefinition);
    const types = (dbTypes || resolvePrismaDbTypes(appDefinition)).filter((t) =>
        DB_TYPES.includes(t)
    );
    const results = [];

    for (const dbType of types) {
        const schemaDir = path.join(corePath, `prisma-${dbType}`);
        const schemaPath = path.join(schemaDir, 'schema.prisma');
        const basePath = path.join(schemaDir, 'schema.base.prisma');
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Core Prisma schema not found: ${schemaPath}`);
        }

        const extensionSchemas = getExtensionSchemaPaths(extensions, dbType);
        // Nothing to compose and nothing composed before: leave core untouched.
        if (extensionSchemas.length === 0 && !fs.existsSync(basePath)) {
            results.push({ dbType, changed: false, migrations: [] });
            continue;
        }

        if (!fs.existsSync(basePath)) fs.copyFileSync(schemaPath, basePath);
        const target = buildComposedSchema(
            fs.readFileSync(basePath, 'utf-8'),
            extensionSchemas
        );
        const current = fs.readFileSync(schemaPath, 'utf-8');
        const schemaChanged = current !== target;
        if (schemaChanged) fs.writeFileSync(schemaPath, target, 'utf-8');

        const migrations =
            dbType === 'postgresql'
                ? copyExtensionMigrations(
                      extensions,
                      path.join(schemaDir, 'migrations')
                  )
                : [];

        const clientPath = path.join(
            corePath,
            'generated',
            `prisma-${dbType}`,
            'schema.prisma'
        );
        const clientStale =
            !fs.existsSync(clientPath) ||
            fs.readFileSync(clientPath, 'utf-8') !== target;

        if (schemaChanged || clientStale) {
            log(
                `[Frigg] Composing ${extensionSchemas.length} extension schema(s) into the ${dbType} Prisma client`
            );
            generate({ schemaPath, corePath, dbType });
        }
        if (migrations.length > 0) {
            log(`[Frigg] Added extension migrations: ${migrations.join(', ')}`);
        }

        results.push({
            dbType,
            changed: schemaChanged || clientStale || migrations.length > 0,
            migrations,
        });
    }

    return { changed: results.some((r) => r.changed), results };
}

module.exports = {
    composeExtensionPrisma,
    resolvePrismaDbTypes,
    buildComposedSchema,
    copyExtensionMigrations,
};
