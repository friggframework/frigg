import fs from 'fs';
import path from 'path';

export async function parseCollectionsFromSchema(schemaPath: string): Promise<string[]> {
    try {
        const schemaContent = await fs.promises.readFile(schemaPath, 'utf-8');
        return extractCollectionNames(schemaContent);
    } catch (error) {
        throw new Error(
            `Failed to parse Prisma schema at ${schemaPath}: ${(error as Error).message}`
        );
    }
}

export function parseCollectionsFromSchemaSync(schemaPath: string): string[] {
    try {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        return extractCollectionNames(schemaContent);
    } catch (error) {
        throw new Error(
            `Failed to parse Prisma schema at ${schemaPath}: ${(error as Error).message}`
        );
    }
}

export function extractCollectionNames(schemaContent: string): string[] {
    const collections: string[] = [];

    const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;

    let match: RegExpExecArray | null;
    while ((match = modelRegex.exec(schemaContent)) !== null) {
        const modelName = match[1];
        const modelBody = match[2];

        const mapMatch = modelBody.match(/@@map\s*\(\s*["'](\w+)["']\s*\)/);

        if (mapMatch) {
            collections.push(mapMatch[1]);
        } else {
            collections.push(modelName);
        }
    }

    return collections;
}

export function findMongoDBSchemaFile(startDir: string = __dirname): string | null {
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

export async function getCollectionsFromSchema(): Promise<string[]> {
    const schemaPath = findMongoDBSchemaFile();

    if (!schemaPath) {
        throw new Error(
            'Could not find Prisma MongoDB schema file. ' +
            'Searched: prisma-mongodb/schema.prisma, prisma/schema.prisma, schema.prisma'
        );
    }

    return await parseCollectionsFromSchema(schemaPath);
}

export function getCollectionsFromSchemaSync(): string[] {
    const schemaPath = findMongoDBSchemaFile();

    if (!schemaPath) {
        throw new Error(
            'Could not find Prisma MongoDB schema file. ' +
            'Searched: prisma-mongodb/schema.prisma, prisma/schema.prisma, schema.prisma'
        );
    }

    return parseCollectionsFromSchemaSync(schemaPath);
}
