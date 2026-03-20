import { prisma } from '../prisma';

export async function ensureCollectionExists(collectionName: string): Promise<void> {
    try {
        const result = await (prisma as any).$runCommandRaw({
            listCollections: 1,
            filter: { name: collectionName },
        });

        const collections = (result as Record<string, unknown>).cursor
            ? ((result as Record<string, unknown>).cursor as Record<string, unknown>).firstBatch as unknown[]
            : [];

        if (collections.length === 0) {
            await (prisma as any).$runCommandRaw({ create: collectionName });
            console.log(`Created MongoDB collection: ${collectionName}`);
        }
    } catch (error: unknown) {
        if ((error as { codeName?: string }).codeName === 'NamespaceExists') {
            return;
        }
        console.warn(`Error ensuring collection ${collectionName} exists:`, (error as Error).message);
    }
}

export async function ensureCollectionsExist(collectionNames: string[]): Promise<void> {
    await Promise.all(collectionNames.map(name => ensureCollectionExists(name)));
}

export async function collectionExists(collectionName: string): Promise<boolean> {
    try {
        const result = await (prisma as any).$runCommandRaw({
            listCollections: 1,
            filter: { name: collectionName },
        });

        const collections = (result as Record<string, unknown>).cursor
            ? ((result as Record<string, unknown>).cursor as Record<string, unknown>).firstBatch as unknown[]
            : [];
        return collections.length > 0;
    } catch (error) {
        console.error(`Error checking if collection ${collectionName} exists:`, (error as Error).message);
        return false;
    }
}
